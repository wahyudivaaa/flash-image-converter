/**
 * Minimal TIFF/DNG parser that extracts the largest embedded preview JPEG.
 *
 * DNG layout: top-level IFD points to raw image data + SubIFDs containing
 * preview thumbnails. Phone DNGs typically include a full-resolution
 * 8-bit RGB JPEG in a SubIFD (NewSubfileType=1).
 *
 * We don't need a full TIFF parser — only enough to:
 *   1. Walk IFDs (top-level + SubIFDs)
 *   2. Find pages with Compression=6 or 7 (JPEG variants), 8-bit
 *   3. Extract their byte ranges via JPEGInterchangeFormat tag OR
 *      reconstruct from StripOffsets/StripByteCounts
 *
 * Returns the JPEG bytes or null if no preview is embedded.
 */

const TAGS = {
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  PhotometricInterpretation: 262,
  StripOffsets: 273,
  Orientation: 274,
  StripByteCounts: 279,
  SubIFDs: 330,
  JPEGInterchangeFormat: 513,
  JPEGInterchangeFormatLength: 514,
  NewSubfileType: 254,
} as const;

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

interface TiffReader {
  view: DataView;
  little: boolean;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number; // where the values START in the file (resolved if not inline)
}

function readU16(r: TiffReader, off: number): number {
  return r.view.getUint16(off, r.little);
}

function readU32(r: TiffReader, off: number): number {
  return r.view.getUint32(off, r.little);
}

function readNumberByType(r: TiffReader, off: number, type: number): number {
  switch (type) {
    case 1:
    case 7:
      return r.view.getUint8(off);
    case 3:
      return r.view.getUint16(off, r.little);
    case 4:
      return r.view.getUint32(off, r.little);
    case 8:
      return r.view.getInt16(off, r.little);
    case 9:
      return r.view.getInt32(off, r.little);
    default:
      return r.view.getUint32(off, r.little);
  }
}

function getEntryValues(r: TiffReader, entry: IfdEntry): number[] {
  const size = TYPE_SIZES[entry.type] ?? 4;
  const total = size * entry.count;
  const out: number[] = [];
  if (total <= 4) {
    // Inline values stored in the entry's valueOffset slot. We need to
    // re-read from the original entry offset because valueOffset has been
    // resolved already.
    // Actually for inline we re-encode from the 4-byte field (valueOffset
    // stored as raw little-endian/big-endian uint32).
    for (let i = 0; i < entry.count; i++) {
      // Reconstruct via encoding back to 4 bytes
      const buf = new ArrayBuffer(4);
      const dv = new DataView(buf);
      dv.setUint32(0, entry.valueOffset, r.little);
      const sub = new DataView(buf);
      const subReader: TiffReader = { view: sub, little: r.little };
      out.push(readNumberByType(subReader, i * size, entry.type));
    }
  } else {
    for (let i = 0; i < entry.count; i++) {
      out.push(readNumberByType(r, entry.valueOffset + i * size, entry.type));
    }
  }
  return out;
}

function readIfd(r: TiffReader, offset: number): { entries: IfdEntry[]; nextOffset: number } {
  const count = readU16(r, offset);
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entryOff = offset + 2 + i * 12;
    const tag = readU16(r, entryOff);
    const type = readU16(r, entryOff + 2);
    const valueCount = readU32(r, entryOff + 4);
    const size = TYPE_SIZES[type] ?? 4;
    const inline = size * valueCount <= 4;
    let valueOffset: number;
    if (inline) {
      // Read raw 4 bytes as a uint32 (we'll decode later based on type)
      valueOffset = readU32(r, entryOff + 8);
    } else {
      valueOffset = readU32(r, entryOff + 8);
    }
    entries.push({ tag, type, count: valueCount, valueOffset });
  }
  const nextOffset = readU32(r, offset + 2 + count * 12);
  return { entries, nextOffset };
}

interface PageInfo {
  width: number;
  height: number;
  bitsPerSample: number;
  compression: number;
  photometric: number;
  newSubfileType: number;
  jpegOffset?: number;
  jpegLength?: number;
  stripOffsets?: number[];
  stripByteCounts?: number[];
}

function describePage(r: TiffReader, entries: IfdEntry[]): PageInfo {
  const get = (tag: number) => entries.find((e) => e.tag === tag);
  const num = (tag: number, fallback = 0): number => {
    const e = get(tag);
    if (!e) return fallback;
    return getEntryValues(r, e)[0] ?? fallback;
  };
  const arr = (tag: number): number[] => {
    const e = get(tag);
    if (!e) return [];
    return getEntryValues(r, e);
  };
  return {
    width: num(TAGS.ImageWidth),
    height: num(TAGS.ImageLength),
    bitsPerSample: num(TAGS.BitsPerSample, 8),
    compression: num(TAGS.Compression),
    photometric: num(TAGS.PhotometricInterpretation),
    newSubfileType: num(TAGS.NewSubfileType),
    jpegOffset: get(TAGS.JPEGInterchangeFormat) ? num(TAGS.JPEGInterchangeFormat) : undefined,
    jpegLength: get(TAGS.JPEGInterchangeFormatLength)
      ? num(TAGS.JPEGInterchangeFormatLength)
      : undefined,
    stripOffsets: arr(TAGS.StripOffsets),
    stripByteCounts: arr(TAGS.StripByteCounts),
  };
}

function isJpegPage(p: PageInfo): boolean {
  // Compression: 6 = old JPEG (deprecated), 7 = JPEG/TIFF
  // Photometric: 2 = RGB, 6 = YCbCr (typical for embedded JPEG)
  if (p.compression !== 6 && p.compression !== 7) return false;
  if (p.bitsPerSample !== 8) return false;
  return p.photometric === 2 || p.photometric === 6;
}

function jpegBytesFromPage(buf: Uint8Array, p: PageInfo): Uint8Array | null {
  if (p.jpegOffset !== undefined && p.jpegLength !== undefined && p.jpegLength > 0) {
    return buf.slice(p.jpegOffset, p.jpegOffset + p.jpegLength);
  }
  if (p.stripOffsets && p.stripByteCounts && p.stripOffsets.length > 0) {
    if (p.stripOffsets.length === 1) {
      return buf.slice(p.stripOffsets[0], p.stripOffsets[0] + p.stripByteCounts[0]);
    }
    // Concatenate strips (rare for embedded JPEG previews)
    const total = p.stripByteCounts.reduce((a, b) => a + b, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (let i = 0; i < p.stripOffsets.length; i++) {
      const slice = buf.slice(p.stripOffsets[i], p.stripOffsets[i] + p.stripByteCounts[i]);
      out.set(slice, cursor);
      cursor += slice.length;
    }
    return out;
  }
  return null;
}

export interface PreviewExtraction {
  jpeg: Uint8Array;
  width: number;
  height: number;
  orientation: number;
}

/**
 * Find the largest embedded JPEG preview in a DNG/TIFF file.
 * Returns null when no preview is present.
 */
export function extractDngPreview(buffer: Uint8Array): PreviewExtraction | null {
  if (buffer.length < 8) return null;

  // TIFF header: II*\0 (little) or MM\0* (big)
  const byte0 = buffer[0];
  const byte1 = buffer[1];
  let little: boolean;
  if (byte0 === 0x49 && byte1 === 0x49) little = true;
  else if (byte0 === 0x4d && byte1 === 0x4d) little = false;
  else return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const r: TiffReader = { view, little };

  const magic = readU16(r, 2);
  if (magic !== 42) return null; // BigTIFF (43) not supported here

  const firstIfd = readU32(r, 4);

  // Walk all IFDs (top-level chain) and their SubIFDs; collect JPEG-compressed pages.
  const pages: PageInfo[] = [];
  const orientations: number[] = [];

  const visited = new Set<number>();
  const queue: number[] = [firstIfd];

  while (queue.length > 0) {
    const offset = queue.shift()!;
    if (offset === 0 || visited.has(offset)) continue;
    visited.add(offset);
    if (offset >= buffer.length) continue;

    let ifd;
    try {
      ifd = readIfd(r, offset);
    } catch {
      continue;
    }
    const info = describePage(r, ifd.entries);
    pages.push(info);

    const orientationEntry = ifd.entries.find((e) => e.tag === TAGS.Orientation);
    if (orientationEntry) {
      orientations.push(getEntryValues(r, orientationEntry)[0] ?? 1);
    }

    // Follow the IFD chain
    if (ifd.nextOffset && !visited.has(ifd.nextOffset)) {
      queue.push(ifd.nextOffset);
    }

    // Follow SubIFDs
    const subEntry = ifd.entries.find((e) => e.tag === TAGS.SubIFDs);
    if (subEntry) {
      const subOffsets = getEntryValues(r, subEntry);
      for (const sub of subOffsets) {
        if (sub > 0 && !visited.has(sub)) queue.push(sub);
      }
    }
  }

  // Pick the largest JPEG page.
  const jpegPages = pages.filter(isJpegPage);
  if (jpegPages.length === 0) return null;

  jpegPages.sort((a, b) => b.width * b.height - a.width * a.height);
  const chosen = jpegPages[0];
  const jpeg = jpegBytesFromPage(buffer, chosen);
  if (!jpeg) return null;

  return {
    jpeg,
    width: chosen.width,
    height: chosen.height,
    orientation: orientations[0] ?? 1,
  };
}

/**
 * Quick check: does this byte sequence look like a DNG?
 * (TIFF magic + DNGVersion tag is usually present, but we trust the extension
 * for routing purposes; this just confirms it's at least TIFF-shaped.)
 */
export function isTiffShaped(buffer: Uint8Array): boolean {
  if (buffer.length < 8) return false;
  const sig = (buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4d && buffer[1] === 0x4d);
  return sig;
}

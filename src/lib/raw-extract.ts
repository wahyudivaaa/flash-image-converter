/**
 * Universal RAW preview extractor.
 *
 * Supports the following camera RAW formats:
 *   - DNG  (Adobe / mobile)         — TIFF-based with SubIFDs
 *   - CR2  (Canon RAW v2)           — TIFF-based, IFD0 = full preview JPEG
 *   - NEF  (Nikon)                  — TIFF-based, preview in SubIFD
 *   - ARW  (Sony Alpha)             — TIFF-based, preview in SubIFD
 *   - PEF  (Pentax)                 — TIFF-based
 *   - ORF  (Olympus)                — TIFF-shaped with non-standard magic
 *   - RW2  (Panasonic)              — TIFF-shaped with non-standard magic
 *   - RAF  (Fujifilm)               — Custom container, JFIF embedded at offset 84
 *   - CR3  (Canon RAW v3)           — ISO BMFF container (sub-set of MP4)
 *
 * Returns the largest embedded preview JPEG. Strategy per format family:
 *
 *   TIFF-shaped (DNG/CR2/NEF/ARW/PEF/ORF/RW2):
 *     Walk all IFDs + SubIFDs, find pages that look like an embedded JPEG
 *     (compression 6/7, photometric 2/6, 8-bit), pick the largest by area.
 *
 *   RAF:
 *     8-byte magic "FUJIFILMCCD-RAW", JFIF data offset/length stored at fixed
 *     positions in the header.
 *
 *   CR3:
 *     ISO BMFF box parser. The full-resolution preview JPEG lives inside a
 *     CRAW track (uuid'd container). We walk boxes lazily and pick the JPEG
 *     by SOI/EOI scan.
 */

// =============================================================================
// Shared types
// =============================================================================

export interface PreviewExtraction {
  jpeg: Uint8Array;
  width: number;
  height: number;
  orientation: number;
}

// =============================================================================
// Section A — TIFF-based RAW (DNG, CR2, NEF, ARW, PEF, ORF, RW2)
// =============================================================================

const TAGS = {
  NewSubfileType: 254,
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
} as const;

const TYPE_SIZES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8,
};

interface TiffReader {
  view: DataView;
  little: boolean;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
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

function readU16(r: TiffReader, off: number): number {
  return r.view.getUint16(off, r.little);
}
function readU32(r: TiffReader, off: number): number {
  return r.view.getUint32(off, r.little);
}

function readNumberByType(r: TiffReader, off: number, type: number): number {
  switch (type) {
    case 1: case 7: return r.view.getUint8(off);
    case 3: return r.view.getUint16(off, r.little);
    case 4: return r.view.getUint32(off, r.little);
    case 8: return r.view.getInt16(off, r.little);
    case 9: return r.view.getInt32(off, r.little);
    default: return r.view.getUint32(off, r.little);
  }
}

function getEntryValues(r: TiffReader, entry: IfdEntry): number[] {
  const size = TYPE_SIZES[entry.type] ?? 4;
  const total = size * entry.count;
  const out: number[] = [];
  if (total <= 4) {
    const buf = new ArrayBuffer(4);
    const dv = new DataView(buf);
    dv.setUint32(0, entry.valueOffset, r.little);
    const sub: TiffReader = { view: dv, little: r.little };
    for (let i = 0; i < entry.count; i++) {
      out.push(readNumberByType(sub, i * size, entry.type));
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
    const valueOffset = readU32(r, entryOff + 8);
    entries.push({ tag, type, count: valueCount, valueOffset });
  }
  const nextOffset = readU32(r, offset + 2 + count * 12);
  return { entries, nextOffset };
}

function describePage(r: TiffReader, entries: IfdEntry[]): PageInfo {
  const get = (tag: number) => entries.find((e) => e.tag === tag);
  const num = (tag: number, fb = 0): number => {
    const e = get(tag);
    if (!e) return fb;
    return getEntryValues(r, e)[0] ?? fb;
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

/**
 * Detect whether a buffer looks like a TIFF (or TIFF-shaped RAW: ORF, RW2).
 * Some Olympus ORF files use magic 0x4F52 ("OR") or 0x5352 ("SR") instead
 * of the standard 0x002A (42). Panasonic RW2 uses 0x0055 (85) instead of 42.
 */
function detectTiffShape(buffer: Uint8Array): { little: boolean } | null {
  if (buffer.length < 8) return null;
  let little: boolean;
  if (buffer[0] === 0x49 && buffer[1] === 0x49) little = true;
  else if (buffer[0] === 0x4d && buffer[1] === 0x4d) little = false;
  else return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint16(2, little);
  // 42 = standard TIFF; 0x4F52/'RO' = ORF (older); 0x5352/'RS' = ORF newer; 0x0055 = RW2
  if (magic === 42 || magic === 0x4f52 || magic === 0x5352 || magic === 0x0055) {
    return { little };
  }
  return null;
}

function extractFromTiffShaped(buffer: Uint8Array): PreviewExtraction | null {
  const shape = detectTiffShape(buffer);
  if (!shape) return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const r: TiffReader = { view, little: shape.little };
  const firstIfd = readU32(r, 4);

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
    pages.push(describePage(r, ifd.entries));

    const orientationEntry = ifd.entries.find((e) => e.tag === TAGS.Orientation);
    if (orientationEntry) {
      orientations.push(getEntryValues(r, orientationEntry)[0] ?? 1);
    }

    if (ifd.nextOffset && !visited.has(ifd.nextOffset)) {
      queue.push(ifd.nextOffset);
    }

    const subEntry = ifd.entries.find((e) => e.tag === TAGS.SubIFDs);
    if (subEntry) {
      for (const sub of getEntryValues(r, subEntry)) {
        if (sub > 0 && !visited.has(sub)) queue.push(sub);
      }
    }
  }

  const jpegPages = pages.filter(isJpegPage);
  if (jpegPages.length === 0) return null;
  jpegPages.sort((a, b) => b.width * b.height - a.width * a.height);
  const chosen = jpegPages[0];
  const jpeg = jpegBytesFromPage(buffer, chosen);
  if (!jpeg) return null;

  return { jpeg, width: chosen.width, height: chosen.height, orientation: orientations[0] ?? 1 };
}

// =============================================================================
// Section B — Fujifilm RAF
// =============================================================================

/**
 * RAF layout:
 *   bytes 0..15   : "FUJIFILMCCD-RAW " (16 bytes magic)
 *   bytes 84..87  : JFIF (preview JPEG) offset (uint32 BE)
 *   bytes 88..91  : JFIF length (uint32 BE)
 */
function extractFromRaf(buffer: Uint8Array): PreviewExtraction | null {
  if (buffer.length < 96) return null;
  const magic = String.fromCharCode(...buffer.slice(0, 16));
  if (!magic.startsWith("FUJIFILMCCD-RAW")) return null;

  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const jpegOff = dv.getUint32(84, false); // big-endian
  const jpegLen = dv.getUint32(88, false);
  if (jpegOff === 0 || jpegLen === 0) return null;
  if (jpegOff + jpegLen > buffer.length) return null;

  const jpeg = buffer.slice(jpegOff, jpegOff + jpegLen);
  if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) return null;

  const dims = readJpegDimensions(jpeg);
  return {
    jpeg,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
    orientation: 1,
  };
}

// =============================================================================
// Section C — Canon CR3 (ISO BMFF)
// =============================================================================

interface BmffBox {
  type: string;
  start: number;     // box header start
  payloadStart: number;
  end: number;       // exclusive
}

function readBox(buffer: Uint8Array, offset: number): BmffBox | null {
  if (offset + 8 > buffer.length) return null;
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let size = dv.getUint32(offset, false);
  const type = String.fromCharCode(
    buffer[offset + 4], buffer[offset + 5],
    buffer[offset + 6], buffer[offset + 7],
  );
  let headerSize = 8;
  if (size === 1) {
    // Large-size 64-bit
    if (offset + 16 > buffer.length) return null;
    const high = dv.getUint32(offset + 8, false);
    const low = dv.getUint32(offset + 12, false);
    size = high * 0x100000000 + low;
    headerSize = 16;
  } else if (size === 0) {
    size = buffer.length - offset; // box extends to end of file
  }
  return {
    type,
    start: offset,
    payloadStart: offset + headerSize,
    end: offset + size,
  };
}

function* walkBoxes(buffer: Uint8Array, start: number, end: number): Generator<BmffBox> {
  let cursor = start;
  while (cursor < end) {
    const box = readBox(buffer, cursor);
    if (!box || box.end <= cursor || box.end > end) return;
    yield box;
    cursor = box.end;
  }
}

/**
 * Find the largest JPEG (FF D8 ... FF D9) in a byte range. We use this
 * because the CR3 spec is murky and Canon embeds preview JPEGs in multiple
 * places (PRVW, mdat tracks). Brute-force JPEG scan is the pragmatic option.
 */
function findLargestJpeg(buffer: Uint8Array, start: number, end: number): Uint8Array | null {
  let best: Uint8Array | null = null;
  let i = start;
  while (i < end - 4) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      // Found SOI candidate. Scan forward for EOI.
      let j = i + 2;
      while (j < end - 1) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          const candidate = buffer.slice(i, j + 2);
          if (!best || candidate.length > best.length) {
            best = candidate;
          }
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= end - 1) break;
    } else {
      i++;
    }
  }
  return best;
}

function extractFromCr3(buffer: Uint8Array): PreviewExtraction | null {
  // Verify ftyp box at start with brand "crx "
  const ftyp = readBox(buffer, 0);
  if (!ftyp || ftyp.type !== "ftyp") return null;
  if (ftyp.payloadStart + 4 > buffer.length) return null;
  const brand = String.fromCharCode(
    buffer[ftyp.payloadStart],
    buffer[ftyp.payloadStart + 1],
    buffer[ftyp.payloadStart + 2],
    buffer[ftyp.payloadStart + 3],
  );
  if (brand !== "crx ") return null;

  // Easiest path: scan whole buffer for JPEG markers, take the largest.
  // Skips writing a full BMFF tree walker. CR3 files are 30-60 MB so the
  // brute-force scan is still fast (~50 ms for 50 MB on Node).
  const jpeg = findLargestJpeg(buffer, ftyp.end, buffer.length);
  if (!jpeg) return null;

  const dims = readJpegDimensions(jpeg);
  return {
    jpeg,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
    orientation: 1,
  };
}

// =============================================================================
// Section D — JPEG dimension parser (used by RAF/CR3 fallbacks)
// =============================================================================

function readJpegDimensions(jpeg: Uint8Array): { width: number; height: number } | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let i = 2;
  while (i < jpeg.length - 8) {
    if (jpeg[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = jpeg[i + 1];
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry image dimensions
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      // Length (2 BE), precision (1), height (2 BE), width (2 BE)
      const dv = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
      const height = dv.getUint16(i + 5, false);
      const width = dv.getUint16(i + 7, false);
      return { width, height };
    }
    // Skip standard markers
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 ||
        (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Variable-length marker: read length and skip
    const dv = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
    if (i + 4 > jpeg.length) break;
    const len = dv.getUint16(i + 2, false);
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

// =============================================================================
// Section E — Public dispatcher
// =============================================================================

export type RawFormat = "dng" | "cr2" | "cr3" | "nef" | "arw" | "rw2" | "orf" | "raf" | "pef";

/**
 * Detect the RAW format from the file content (magic bytes), falling back
 * to the file extension when content is ambiguous. Returns null if the file
 * doesn't match any known RAW signature.
 */
export function detectRawFormat(buffer: Uint8Array, filename?: string): RawFormat | null {
  if (buffer.length < 16) return null;

  // RAF: literal text magic
  if (
    buffer[0] === 0x46 && buffer[1] === 0x55 && buffer[2] === 0x4a && buffer[3] === 0x49 &&
    buffer[4] === 0x46 && buffer[5] === 0x49 && buffer[6] === 0x4c && buffer[7] === 0x4d
  ) {
    return "raf";
  }

  // CR3: ftyp box with brand "crx "
  if (
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    if (
      buffer[8] === 0x63 && buffer[9] === 0x72 && buffer[10] === 0x78 && buffer[11] === 0x20
    ) {
      return "cr3";
    }
  }

  // TIFF-shaped: refine using extension
  const shape = detectTiffShape(buffer);
  if (shape) {
    const ext = (filename ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (ext === "cr2") return "cr2";
    if (ext === "nef") return "nef";
    if (ext === "arw") return "arw";
    if (ext === "rw2") return "rw2";
    if (ext === "orf") return "orf";
    if (ext === "pef") return "pef";
    if (ext === "dng") return "dng";
    // No extension match: peek at bytes 8-11 for CR2 sub-magic "CR\x02\x00"
    if (buffer.length >= 12 && buffer[8] === 0x43 && buffer[9] === 0x52) return "cr2";
    return "dng";
  }

  return null;
}

/**
 * Universal RAW preview extractor. Returns null if the file isn't a known
 * RAW or has no embedded preview.
 */
export function extractRawPreview(
  buffer: Uint8Array,
  filename?: string,
): PreviewExtraction | null {
  const fmt = detectRawFormat(buffer, filename);
  if (fmt === null) return null;

  if (fmt === "raf") return extractFromRaf(buffer);
  if (fmt === "cr3") return extractFromCr3(buffer);
  // All other RAW formats are TIFF-based
  return extractFromTiffShaped(buffer);
}

// =============================================================================
// Backwards compatibility — keep the original names so existing imports work
// =============================================================================

/** @deprecated Use extractRawPreview() instead. Kept for backwards compatibility. */
export function extractDngPreview(buffer: Uint8Array): PreviewExtraction | null {
  return extractRawPreview(buffer);
}

/** Quick check: does this byte sequence look TIFF-shaped (DNG / CR2 / NEF / ARW / PEF). */
export function isTiffShaped(buffer: Uint8Array): boolean {
  return detectTiffShape(buffer) !== null;
}

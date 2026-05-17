/**
 * Standalone smoke test for the DNG preview extractor.
 * Run: node scripts/test-dng-extract.mjs <path-to-dng>
 */
import fs from "node:fs";
import path from "node:path";

// Compile-time the .ts module by using tsx or rebuild as plain JS at runtime.
// To keep this dependency-free we'll register a TS-on-the-fly hook via a
// minimal copy of the parser logic — but simpler: spawn `npx tsx`.
// However the user's environment has Node 20, so we'll rely on a pre-built JS
// version. For now we ship this as a standalone JS port.

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
};

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function readU16(view, off, little) { return view.getUint16(off, little); }
function readU32(view, off, little) { return view.getUint32(off, little); }

function readNumberByType(view, off, type, little) {
  switch (type) {
    case 1: case 7: return view.getUint8(off);
    case 3: return view.getUint16(off, little);
    case 4: return view.getUint32(off, little);
    case 8: return view.getInt16(off, little);
    case 9: return view.getInt32(off, little);
    default: return view.getUint32(off, little);
  }
}

function getEntryValues(view, entry, little) {
  const size = TYPE_SIZES[entry.type] ?? 4;
  const total = size * entry.count;
  const out = [];
  if (total <= 4) {
    const buf = new ArrayBuffer(4);
    const dv = new DataView(buf);
    dv.setUint32(0, entry.valueOffset, little);
    for (let i = 0; i < entry.count; i++) {
      out.push(readNumberByType(dv, i * size, entry.type, little));
    }
  } else {
    for (let i = 0; i < entry.count; i++) {
      out.push(readNumberByType(view, entry.valueOffset + i * size, entry.type, little));
    }
  }
  return out;
}

function readIfd(view, offset, little) {
  const count = readU16(view, offset, little);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entryOff = offset + 2 + i * 12;
    const tag = readU16(view, entryOff, little);
    const type = readU16(view, entryOff + 2, little);
    const valueCount = readU32(view, entryOff + 4, little);
    const valueOffset = readU32(view, entryOff + 8, little);
    entries.push({ tag, type, count: valueCount, valueOffset });
  }
  const nextOffset = readU32(view, offset + 2 + count * 12, little);
  return { entries, nextOffset };
}

function describePage(view, entries, little) {
  const get = (tag) => entries.find((e) => e.tag === tag);
  const num = (tag, fb = 0) => {
    const e = get(tag);
    if (!e) return fb;
    return getEntryValues(view, e, little)[0] ?? fb;
  };
  const arr = (tag) => {
    const e = get(tag);
    if (!e) return [];
    return getEntryValues(view, e, little);
  };
  return {
    width: num(TAGS.ImageWidth),
    height: num(TAGS.ImageLength),
    bitsPerSample: num(TAGS.BitsPerSample, 8),
    compression: num(TAGS.Compression),
    photometric: num(TAGS.PhotometricInterpretation),
    newSubfileType: num(TAGS.NewSubfileType),
    jpegOffset: get(TAGS.JPEGInterchangeFormat) ? num(TAGS.JPEGInterchangeFormat) : undefined,
    jpegLength: get(TAGS.JPEGInterchangeFormatLength) ? num(TAGS.JPEGInterchangeFormatLength) : undefined,
    stripOffsets: arr(TAGS.StripOffsets),
    stripByteCounts: arr(TAGS.StripByteCounts),
  };
}

function isJpegPage(p) {
  if (p.compression !== 6 && p.compression !== 7) return false;
  if (p.bitsPerSample !== 8) return false;
  return p.photometric === 2 || p.photometric === 6;
}

function jpegBytesFromPage(buf, p) {
  if (p.jpegOffset !== undefined && p.jpegLength !== undefined && p.jpegLength > 0) {
    return buf.slice(p.jpegOffset, p.jpegOffset + p.jpegLength);
  }
  if (p.stripOffsets?.length && p.stripByteCounts?.length) {
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

function extractDngPreview(buffer) {
  if (buffer.length < 8) return null;
  let little;
  if (buffer[0] === 0x49 && buffer[1] === 0x49) little = true;
  else if (buffer[0] === 0x4d && buffer[1] === 0x4d) little = false;
  else return null;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = readU16(view, 2, little);
  if (magic !== 42) return null;

  const firstIfd = readU32(view, 4, little);
  const pages = [];
  let orientation = 1;
  const visited = new Set();
  const queue = [firstIfd];

  while (queue.length > 0) {
    const offset = queue.shift();
    if (offset === 0 || visited.has(offset)) continue;
    visited.add(offset);
    if (offset >= buffer.length) continue;

    let ifd;
    try {
      ifd = readIfd(view, offset, little);
    } catch {
      continue;
    }
    pages.push(describePage(view, ifd.entries, little));

    const orientationEntry = ifd.entries.find((e) => e.tag === TAGS.Orientation);
    if (orientationEntry && orientation === 1) {
      orientation = getEntryValues(view, orientationEntry, little)[0] ?? 1;
    }

    if (ifd.nextOffset && !visited.has(ifd.nextOffset)) queue.push(ifd.nextOffset);

    const subEntry = ifd.entries.find((e) => e.tag === TAGS.SubIFDs);
    if (subEntry) {
      const subOffsets = getEntryValues(view, subEntry, little);
      for (const sub of subOffsets) {
        if (sub > 0 && !visited.has(sub)) queue.push(sub);
      }
    }
  }

  console.log(`Total pages walked: ${pages.length}`);
  for (const p of pages) {
    console.log(`  ${p.width}x${p.height} bps=${p.bitsPerSample} comp=${p.compression} photo=${p.photometric} subfile=${p.newSubfileType}`);
  }

  const jpegPages = pages.filter(isJpegPage);
  if (jpegPages.length === 0) return null;

  jpegPages.sort((a, b) => b.width * b.height - a.width * a.height);
  const chosen = jpegPages[0];
  const jpeg = jpegBytesFromPage(buffer, chosen);
  if (!jpeg) return null;

  return { jpeg, width: chosen.width, height: chosen.height, orientation };
}

const dngPath = process.argv[2];
if (!dngPath) {
  console.error("usage: node test-dng-extract.mjs <dng-file>");
  process.exit(2);
}

const buf = fs.readFileSync(dngPath);
console.log(`Input: ${dngPath} (${buf.length} bytes)\n`);

const result = extractDngPreview(buf);
if (!result) {
  console.error("\nFAILED: no preview found");
  process.exit(1);
}

console.log(`\nExtracted: ${result.jpeg.length} bytes, ${result.width}x${result.height}, orientation=${result.orientation}`);

// Validate it's a real JPEG (FF D8 ... FF D9)
const isJpeg =
  result.jpeg[0] === 0xff &&
  result.jpeg[1] === 0xd8 &&
  result.jpeg[result.jpeg.length - 2] === 0xff &&
  result.jpeg[result.jpeg.length - 1] === 0xd9;
console.log(`Valid JPEG markers: ${isJpeg ? "YES" : "NO"}`);

// Try to encode through sharp to TIFF (closing the loop end-to-end)
const sharp = (await import("sharp")).default;
const out = await sharp(result.jpeg).tiff({ compression: "lzw" }).toBuffer();
const meta = await sharp(out).metadata();
console.log(`Sharp re-encode: ${out.length} bytes, format=${meta.format}, ${meta.width}x${meta.height}`);

// Save a tiny preview JPEG so user can eyeball
const outDir = path.resolve(process.cwd(), ".dng-test");
fs.mkdirSync(outDir, { recursive: true });
const outJpeg = path.join(outDir, "preview.jpg");
fs.writeFileSync(outJpeg, result.jpeg);
console.log(`Saved preview JPEG: ${outJpeg}`);

const outTiff = path.join(outDir, "out.tiff");
fs.writeFileSync(outTiff, out);
console.log(`Saved TIFF: ${outTiff}`);

console.log("\nOK");

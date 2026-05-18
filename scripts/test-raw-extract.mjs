/**
 * RAW preview extractor tests. Covers:
 *   - Real Samsung DNG (existing test asset, JPEG-XL Linear DNG)
 *   - Synthetic CR2 (TIFF magic + Canon sub-magic + dummy IFD)
 *   - Synthetic ORF (TIFF magic + ORF-style magic 0x4F52)
 *   - Synthetic RW2 (TIFF magic + RW2 magic 0x0055)
 *   - Synthetic RAF (FUJIFILM magic + offset table + JPEG payload)
 *   - Synthetic CR3 (ftyp+'crx ' + JPEG payload)
 *   - Negative: non-RAW returns null, garbage returns null
 *
 * Run: node scripts/test-raw-extract.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { extractRawPreview, detectRawFormat } from "../src/lib/raw-extract.ts";

let pass = 0, fail = 0;
const expect = (cond, msg) => {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else      { fail++; console.log(`  FAIL  ${msg}`); }
};

// --- helpers to build a minimal TIFF with one JPEG-bearing IFD0 ---

function buildJpeg(width, height) {
  // Construct a minimal valid JPEG with an SOF0 marker that encodes the
  // requested dimensions. Real JPEG would have entropy data; we add a tiny
  // realistic body. The extractor only checks magic + dimensions for RAF/CR3
  // so this is enough for end-to-end test.
  const sof = Buffer.alloc(11);
  sof[0] = 0xff; sof[1] = 0xc0;        // SOF0
  sof.writeUInt16BE(8, 2);             // length
  sof[4] = 8;                          // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 1;                          // components
  sof[10] = 0;                         // pad

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),         // SOI
    sof,
    Buffer.from([0xff, 0xd9]),         // EOI
  ]);
}

function buildTiffWithJpegIfd0(magic16 /* 42 for TIFF, 0x4f52 for ORF, 0x0055 for RW2 */, jpegBytes, withCanonHeader = false) {
  // Layout: header (8) + [optional Canon header (8)] + IFD0 + JPEG payload
  const ifdEntryCount = 7;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const headerSize = 8;
  const canonOffset = headerSize;
  const ifdOffset = withCanonHeader ? headerSize + 8 : headerSize;
  const jpegOff = ifdOffset + ifdSize;

  const total = jpegOff + jpegBytes.length;
  const buf = Buffer.alloc(total);

  // TIFF header
  buf[0] = 0x49; buf[1] = 0x49;        // little-endian
  buf.writeUInt16LE(magic16, 2);
  buf.writeUInt32LE(ifdOffset, 4);     // first IFD offset

  // Optional Canon CR2 sub-header at bytes 8-15: "CR\x02\x00" + IFD3 offset (we use 0)
  if (withCanonHeader) {
    buf[canonOffset] = 0x43;     // C
    buf[canonOffset + 1] = 0x52; // R
    buf[canonOffset + 2] = 0x02; // version major
    buf[canonOffset + 3] = 0x00; // version minor
    buf.writeUInt32LE(0, canonOffset + 4); // IFD3 offset (none for our test)
  }

  // IFD0
  let p = ifdOffset;
  buf.writeUInt16LE(ifdEntryCount, p); p += 2;
  // 256: ImageWidth (LONG=4)
  buf.writeUInt16LE(256, p); buf.writeUInt16LE(4, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(2000, p+8); p+=12;
  // 257: ImageLength
  buf.writeUInt16LE(257, p); buf.writeUInt16LE(4, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(1500, p+8); p+=12;
  // 258: BitsPerSample (SHORT=3)
  buf.writeUInt16LE(258, p); buf.writeUInt16LE(3, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(8, p+8); p+=12;
  // 259: Compression (SHORT) = 6 (old-style JPEG)
  buf.writeUInt16LE(259, p); buf.writeUInt16LE(3, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(6, p+8); p+=12;
  // 262: Photometric (SHORT) = 6 (YCbCr)
  buf.writeUInt16LE(262, p); buf.writeUInt16LE(3, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(6, p+8); p+=12;
  // 273: StripOffsets (LONG)
  buf.writeUInt16LE(273, p); buf.writeUInt16LE(4, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(jpegOff, p+8); p+=12;
  // 279: StripByteCounts (LONG)
  buf.writeUInt16LE(279, p); buf.writeUInt16LE(4, p+2); buf.writeUInt32LE(1, p+4); buf.writeUInt32LE(jpegBytes.length, p+8); p+=12;

  // Next IFD offset = 0
  buf.writeUInt32LE(0, p);

  // JPEG body
  jpegBytes.copy(buf, jpegOff);
  return buf;
}

function buildRaf(jpegBytes) {
  // Minimum 96 bytes header. magic at 0, jpeg offset at 84, length at 88.
  const headerLen = 96;
  const buf = Buffer.alloc(headerLen + jpegBytes.length);
  buf.write("FUJIFILMCCD-RAW ", 0, "ascii"); // 16 bytes (with trailing space)
  buf.writeUInt32BE(headerLen, 84);
  buf.writeUInt32BE(jpegBytes.length, 88);
  jpegBytes.copy(buf, headerLen);
  return buf;
}

function buildCr3(jpegBytes) {
  // Minimum: ftyp box (size 24, type 'ftyp', major brand 'crx ', minor 0,
  // compatible brands ['crx ', 'isom']), then a 'mdat' box with our JPEG.
  const ftypBody = Buffer.concat([
    Buffer.from("crx \x00\x00\x00\x00"), // major brand + minor version
    Buffer.from("crx isom"),
  ]);
  const ftypSize = 8 + ftypBody.length;
  const ftyp = Buffer.alloc(ftypSize);
  ftyp.writeUInt32BE(ftypSize, 0);
  ftyp.write("ftyp", 4, "ascii");
  ftypBody.copy(ftyp, 8);

  const mdatSize = 8 + jpegBytes.length;
  const mdat = Buffer.alloc(8);
  mdat.writeUInt32BE(mdatSize, 0);
  mdat.write("mdat", 4, "ascii");

  return Buffer.concat([ftyp, mdat, jpegBytes]);
}

// =============================================================================
// Tests
// =============================================================================

console.log("[1] Real Samsung DNG (Linear DNG, JPEG-XL)");
{
  const dngPath = "C:/Users/wahyu/Downloads/dng/20260517_045421.dng";
  if (fs.existsSync(dngPath)) {
    const buf = new Uint8Array(fs.readFileSync(dngPath));
    const fmt = detectRawFormat(buf, "20260517_045421.dng");
    expect(fmt === "dng", `format detected = dng (got ${fmt})`);
    const result = extractRawPreview(buf, "20260517_045421.dng");
    expect(result !== null, "preview extracted");
    if (result) {
      expect(result.jpeg[0] === 0xff && result.jpeg[1] === 0xd8, "preview is JPEG (FF D8)");
      expect(result.width > 0 && result.height > 0, `dimensions ${result.width}x${result.height}`);
    }
  } else {
    console.log("  SKIP (no Samsung DNG available locally)");
  }
}

console.log("\n[2] Synthetic CR2 (TIFF magic + Canon sub-header)");
{
  const jpeg = buildJpeg(2000, 1500);
  const cr2 = buildTiffWithJpegIfd0(42, jpeg, true /* with Canon header */);
  const fmt = detectRawFormat(cr2, "test.cr2");
  expect(fmt === "cr2", `format detected = cr2 (got ${fmt})`);
  const result = extractRawPreview(cr2, "test.cr2");
  expect(result !== null, "CR2 preview extracted");
  if (result) {
    expect(result.width === 2000 && result.height === 1500, `dimensions 2000x1500 (got ${result.width}x${result.height})`);
  }
}

console.log("\n[3] Synthetic NEF (TIFF magic + .nef extension)");
{
  const jpeg = buildJpeg(1280, 960);
  const nef = buildTiffWithJpegIfd0(42, jpeg);
  const fmt = detectRawFormat(nef, "test.nef");
  expect(fmt === "nef", `format detected = nef (got ${fmt})`);
  const result = extractRawPreview(nef, "test.nef");
  expect(result !== null, "NEF preview extracted");
}

console.log("\n[4] Synthetic ARW (TIFF magic + .arw)");
{
  const jpeg = buildJpeg(1024, 768);
  const arw = buildTiffWithJpegIfd0(42, jpeg);
  expect(detectRawFormat(arw, "test.arw") === "arw", "format = arw");
  expect(extractRawPreview(arw, "test.arw") !== null, "ARW preview extracted");
}

console.log("\n[5] Synthetic ORF (non-standard magic 0x4F52)");
{
  const jpeg = buildJpeg(800, 600);
  const orf = buildTiffWithJpegIfd0(0x4f52, jpeg);
  const fmt = detectRawFormat(orf, "test.orf");
  expect(fmt === "orf", `format = orf (got ${fmt})`);
  expect(extractRawPreview(orf, "test.orf") !== null, "ORF preview extracted");
}

console.log("\n[6] Synthetic RW2 (Panasonic magic 0x0055)");
{
  const jpeg = buildJpeg(640, 480);
  const rw2 = buildTiffWithJpegIfd0(0x0055, jpeg);
  expect(detectRawFormat(rw2, "test.rw2") === "rw2", "format = rw2");
  expect(extractRawPreview(rw2, "test.rw2") !== null, "RW2 preview extracted");
}

console.log("\n[7] Synthetic RAF (Fujifilm)");
{
  const jpeg = buildJpeg(3000, 2000);
  const raf = buildRaf(jpeg);
  const fmt = detectRawFormat(raf, "test.raf");
  expect(fmt === "raf", `format = raf (got ${fmt})`);
  const result = extractRawPreview(raf, "test.raf");
  expect(result !== null, "RAF preview extracted");
  if (result) {
    expect(result.width === 3000 && result.height === 2000, `dimensions 3000x2000 (got ${result.width}x${result.height})`);
  }
}

console.log("\n[8] Synthetic CR3 (Canon ISO BMFF)");
{
  const jpeg = buildJpeg(6000, 4000);
  const cr3 = buildCr3(jpeg);
  const fmt = detectRawFormat(cr3, "test.cr3");
  expect(fmt === "cr3", `format = cr3 (got ${fmt})`);
  const result = extractRawPreview(cr3, "test.cr3");
  expect(result !== null, "CR3 preview extracted");
  if (result) {
    expect(result.width === 6000 && result.height === 4000, `dimensions 6000x4000 (got ${result.width}x${result.height})`);
  }
}

console.log("\n[9] Synthetic PEF (TIFF magic + .pef)");
{
  const jpeg = buildJpeg(2400, 1600);
  const pef = buildTiffWithJpegIfd0(42, jpeg);
  expect(detectRawFormat(pef, "test.pef") === "pef", "format = pef");
  expect(extractRawPreview(pef, "test.pef") !== null, "PEF preview extracted");
}

console.log("\n[10] Negative: random bytes return null");
{
  const random = Buffer.alloc(1000);
  for (let i = 0; i < 1000; i++) random[i] = i & 0xff;
  expect(detectRawFormat(random) === null, "garbage detected as null");
  expect(extractRawPreview(random) === null, "garbage extraction returns null");
}

console.log("\n[11] Negative: regular JPEG (not a RAW)");
{
  const jpeg = buildJpeg(100, 100);
  expect(detectRawFormat(jpeg) === null, "plain JPEG is not a RAW");
  expect(extractRawPreview(jpeg) === null, "plain JPEG extract returns null");
}

console.log(`\n=== Total: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);

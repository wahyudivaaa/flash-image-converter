/**
 * ICO decoder. Parses the Windows icon container, picks the largest sub-image,
 * and returns its bytes (which are either PNG-encoded or BMP-encoded "DIB").
 *
 * ICO file structure:
 *   - ICONDIR (6 bytes): reserved, type=1, count
 *   - ICONDIRENTRY[count] (16 bytes each): width, height, palette, reserved,
 *     planes, bpp, sizeInBytes, dataOffset
 *   - Sub-image data (PNG byte stream, OR a BMP-stripped DIB header + pixels)
 *
 * For Vista+ icons (size >= 64), entries usually contain raw PNG. For older
 * sizes they contain a BMP "ICO DIB" which is a BITMAPINFOHEADER followed by
 * pixel data PLUS an AND-mask. We handle both:
 *   - PNG sub-image: return as-is (sharp decodes natively)
 *   - DIB sub-image: re-wrap as a complete BMP and decode through our BMP decoder
 */

import sharp from "sharp";
import { decodeBmp } from "./bmp";

interface IcoEntry {
  width: number;
  height: number;
  size: number;
  offset: number;
}

export async function decodeIco(input: Buffer | Uint8Array): Promise<Buffer> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 22) throw new Error("ICO too small (< 22 bytes)");

  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);

  if (reserved !== 0) throw new Error(`unexpected reserved bytes: ${reserved}`);
  if (type !== 1) throw new Error(`not a .ico (type=${type}, expected 1)`);
  if (count === 0) throw new Error("ICO has no entries");

  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    if (off + 16 > buf.length) break;
    const w = buf.readUInt8(off);
    const h = buf.readUInt8(off + 1);
    const size = buf.readUInt32LE(off + 8);
    const dataOff = buf.readUInt32LE(off + 12);
    entries.push({
      // 0 means 256 in the ICO format
      width: w === 0 ? 256 : w,
      height: h === 0 ? 256 : h,
      size,
      offset: dataOff,
    });
  }
  if (entries.length === 0) throw new Error("ICO entries unreadable");

  // Pick the largest by area
  entries.sort((a, b) => b.width * b.height - a.width * a.height);
  const chosen = entries[0];

  if (chosen.offset + chosen.size > buf.length) {
    throw new Error("ICO entry extends beyond file");
  }

  const sub = buf.slice(chosen.offset, chosen.offset + chosen.size);

  // PNG sub-image: starts with 89 50 4E 47 (PNG magic)
  if (
    sub.length >= 4 &&
    sub[0] === 0x89 &&
    sub[1] === 0x50 &&
    sub[2] === 0x4e &&
    sub[3] === 0x47
  ) {
    // sharp decodes PNG natively — just return as a normalized PNG (re-encode
    // so downstream sees a fresh standard buffer)
    return sharp(sub).png().toBuffer();
  }

  // Otherwise it's a DIB (BMP without the file header). Reconstruct a full BMP
  // by prepending a BITMAPFILEHEADER. The DIB's height is doubled (image + AND
  // mask), so divide by 2 for the actual pixel height.
  return rewrapDibAsBmp(sub, chosen.width, chosen.height);
}

async function rewrapDibAsBmp(dib: Buffer, width: number, height: number): Promise<Buffer> {
  // Read the DIB header to figure out the pixel data offset relative to the
  // BMP we'll synthesize. A canonical BITMAPINFOHEADER is 40 bytes; some have
  // larger headers (BITMAPV4/V5HEADER at 108/124).
  if (dib.length < 40) throw new Error("ICO DIB too small");
  const dibSize = dib.readUInt32LE(0);
  if (dibSize < 40) throw new Error(`ICO DIB header invalid (size=${dibSize})`);

  const bpp = dib.readUInt16LE(14);
  // The DIB inside ICO declares height = 2 * actual height (image + mask).
  // Patch the header so our BMP decoder reads the correct height.
  const patched = Buffer.from(dib);
  patched.writeInt32LE(height, 8); // BITMAPINFOHEADER's biHeight at offset 8

  const fileHeaderSize = 14;
  const colorTableSize =
    bpp <= 8 ? (1 << bpp) * 4 : 0; // palette bytes (256-color etc.)
  const pixelDataOffset = fileHeaderSize + dibSize + colorTableSize;

  const fileHeader = Buffer.alloc(fileHeaderSize);
  fileHeader.write("BM", 0, "ascii");
  fileHeader.writeUInt32LE(fileHeaderSize + dib.length, 2);
  fileHeader.writeUInt16LE(0, 6);
  fileHeader.writeUInt16LE(0, 8);
  fileHeader.writeUInt32LE(pixelDataOffset, 10);

  const synth = Buffer.concat([fileHeader, patched]);

  try {
    return await decodeBmp(synth);
  } catch {
    // As a last resort, fall back to letting sharp try (some BMP variants work)
    return sharp(synth).png().toBuffer();
  }

  // unused param suppressed
  void width;
}

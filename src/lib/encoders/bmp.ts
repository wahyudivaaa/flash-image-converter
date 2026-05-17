/**
 * BMP encoder. Writes uncompressed 24-bit BGR (BITMAPINFOHEADER, BI_RGB).
 *
 * Layout:
 *   - BITMAPFILEHEADER (14 bytes)
 *   - BITMAPINFOHEADER (40 bytes)
 *   - Pixel data (BGR, bottom-up, each row padded to multiple of 4 bytes)
 *
 * No alpha (24-bit). Transparency must be flattened to background BEFORE
 * calling this. We deliberately don't use 32-bit BGRA because BMP alpha
 * support is inconsistent across viewers — better to bake the bg in.
 */

import sharp from "sharp";

export async function encodeBmp(
  input: Buffer | Uint8Array,
  background: string,
): Promise<Buffer> {
  // Decode to raw RGB pixels via sharp, flattening transparency onto background.
  const { data, info } = await sharp(input, { failOn: "none" })
    .flatten({ background })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  if (info.channels !== 3) {
    throw new Error(`unexpected channels: ${info.channels}, expected 3`);
  }

  const rowBytes = width * 3;
  const padding = (4 - (rowBytes % 4)) % 4;
  const paddedRow = rowBytes + padding;
  const pixelDataSize = paddedRow * height;
  const fileSize = 54 + pixelDataSize;

  const out = Buffer.alloc(fileSize);

  // --- BITMAPFILEHEADER (14 bytes) ---
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(fileSize, 2);
  out.writeUInt16LE(0, 6); // reserved
  out.writeUInt16LE(0, 8); // reserved
  out.writeUInt32LE(54, 10); // pixel data offset

  // --- BITMAPINFOHEADER (40 bytes) ---
  out.writeUInt32LE(40, 14); // header size
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22); // positive => bottom-up
  out.writeUInt16LE(1, 26); // planes
  out.writeUInt16LE(24, 28); // bits per pixel
  out.writeUInt32LE(0, 30); // compression = BI_RGB
  out.writeUInt32LE(pixelDataSize, 34);
  out.writeInt32LE(2835, 38); // x pixels per meter (~72 DPI)
  out.writeInt32LE(2835, 42); // y pixels per meter
  out.writeUInt32LE(0, 46); // colors used
  out.writeUInt32LE(0, 50); // important colors

  // --- Pixel data ---
  // sharp gives us RGB top-down. BMP wants BGR bottom-up.
  let dst = 54;
  for (let y = height - 1; y >= 0; y--) {
    const srcRow = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const sx = srcRow + x * 3;
      // RGB -> BGR
      out[dst++] = data[sx + 2]; // B
      out[dst++] = data[sx + 1]; // G
      out[dst++] = data[sx + 0]; // R
    }
    if (padding > 0) {
      // zero-pad to 4-byte boundary
      for (let p = 0; p < padding; p++) out[dst++] = 0;
    }
  }

  return out;
}

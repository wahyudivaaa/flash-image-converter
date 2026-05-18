/**
 * BMP decoder. Handles 24-bit and 32-bit uncompressed (BI_RGB) BMP files —
 * the same shape we produce in encoders/bmp.ts plus 32-bit BGRA variants.
 *
 * Reads:
 *   - BITMAPFILEHEADER (14 bytes)
 *   - BITMAPINFOHEADER (40 bytes minimum, may be larger)
 *   - Pixel data: BGR or BGRA, bottom-up (positive height) or top-down (negative)
 *   - Each row padded to a multiple of 4 bytes
 *
 * Returns a PNG buffer (so the rest of the pipeline doesn't have to know BMP).
 *
 * Does NOT support:
 *   - 1/4/8-bit palette modes (uncommon, skip)
 *   - RLE-compressed BMP (legacy)
 *   - 16-bit BMP
 *
 * 95%+ of BMP files in the wild are 24-bit BI_RGB so this covers the practical use case.
 */

import sharp from "sharp";

export async function decodeBmp(input: Buffer | Uint8Array): Promise<Buffer> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 54) throw new Error("BMP too small (< 54 bytes)");
  if (buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error("not a BMP (no 'BM' magic)");

  const pixelOffset = buf.readUInt32LE(10);
  const dibSize = buf.readUInt32LE(14);
  if (dibSize < 40) throw new Error(`BMP DIB header too small (${dibSize} bytes)`);

  const width = buf.readInt32LE(18);
  const heightSigned = buf.readInt32LE(22);
  const planes = buf.readUInt16LE(26);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);

  if (planes !== 1) throw new Error(`unsupported planes: ${planes}`);
  if (compression !== 0 && compression !== 3) {
    // 0 = BI_RGB, 3 = BI_BITFIELDS (we treat 32-bit BI_BITFIELDS like BGRA)
    throw new Error(`unsupported BMP compression mode: ${compression}`);
  }
  if (bpp !== 24 && bpp !== 32) {
    throw new Error(`unsupported BMP bit depth: ${bpp} (only 24 and 32 supported)`);
  }
  if (width <= 0) throw new Error(`invalid width: ${width}`);

  const topDown = heightSigned < 0;
  const height = Math.abs(heightSigned);

  const channels = bpp === 32 ? 4 : 3;
  const rowBytes = width * channels;
  const padding = (4 - (rowBytes % 4)) % 4;
  const paddedRow = rowBytes + padding;

  if (pixelOffset + paddedRow * height > buf.length) {
    throw new Error("BMP pixel data extends beyond file");
  }

  // Build a row-major RGBA buffer for sharp.raw input.
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const srcOff = pixelOffset + srcRow * paddedRow;
    const dstOff = y * width * 4;
    for (let x = 0; x < width; x++) {
      const sx = srcOff + x * channels;
      const dx = dstOff + x * 4;
      // BMP stores BGR(A); convert to RGBA
      out[dx] = buf[sx + 2];     // R <- B-position 2
      out[dx + 1] = buf[sx + 1]; // G
      out[dx + 2] = buf[sx];     // B <- B-position 0
      out[dx + 3] = channels === 4 ? buf[sx + 3] : 255;
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

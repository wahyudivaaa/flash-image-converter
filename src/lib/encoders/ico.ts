/**
 * ICO encoder. Wraps PNG-encoded sub-images in the Windows ICO container.
 *
 * Strategy:
 *   For each requested target size (default 16, 32, 48, 64, 128, 256), use
 *   sharp to produce a square PNG resized with `cover` fit. Then concatenate
 *   them in the ICONDIR + ICONDIRENTRY structure. ICO supports embedding raw
 *   PNG data (used for sizes >= 64 by Windows since Vista).
 *
 * Layout:
 *   - ICONDIR (6 bytes): reserved=0, type=1 (icon), count=N
 *   - ICONDIRENTRY[N] (16 bytes each): width, height, palette, reserved,
 *     planes, bpp, sizeInBytes, dataOffset
 *   - PNG payloads (concatenated)
 */

import sharp from "sharp";

const DEFAULT_SIZES = [16, 32, 48, 64, 128, 256];

export async function encodeIco(
  input: Buffer | Uint8Array,
  sizes: number[] = DEFAULT_SIZES,
): Promise<Buffer> {
  // Generate one PNG per size, square cropped/cover.
  const pngs = await Promise.all(
    sizes.map(async (size) => {
      const png = await sharp(input, { failOn: "none" })
        .resize(size, size, { fit: "cover", position: "centre" })
        .png({ compressionLevel: 9 })
        .toBuffer();
      return { size, png };
    }),
  );

  const HEADER_SIZE = 6;
  const ENTRY_SIZE = 16;
  const directoryBytes = HEADER_SIZE + ENTRY_SIZE * pngs.length;
  const totalDataBytes = pngs.reduce((sum, p) => sum + p.png.length, 0);
  const out = Buffer.alloc(directoryBytes + totalDataBytes);

  // ICONDIR
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type: icon
  out.writeUInt16LE(pngs.length, 4);

  let entryOffset = HEADER_SIZE;
  let dataOffset = directoryBytes;

  for (const { size, png } of pngs) {
    // Width / height: 0 means 256 in ICO format
    out.writeUInt8(size === 256 ? 0 : size, entryOffset);     // width
    out.writeUInt8(size === 256 ? 0 : size, entryOffset + 1); // height
    out.writeUInt8(0, entryOffset + 2); // palette colors (0 = no palette)
    out.writeUInt8(0, entryOffset + 3); // reserved
    out.writeUInt16LE(1, entryOffset + 4); // color planes
    out.writeUInt16LE(32, entryOffset + 6); // bpp
    out.writeUInt32LE(png.length, entryOffset + 8); // bytes in resource
    out.writeUInt32LE(dataOffset, entryOffset + 12); // offset

    png.copy(out, dataOffset);

    entryOffset += ENTRY_SIZE;
    dataOffset += png.length;
  }

  return out;
}

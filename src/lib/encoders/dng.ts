/**
 * DNG encoder. Produces a Linear DNG (PhotometricInterpretation=34892,
 * "LinearRaw") that wraps a sharp-decoded image as 8-bit RGB pixels with
 * the canonical Adobe DNG metadata tags so Lightroom, darktable, RawTherapee
 * etc. accept it as a valid DNG.
 *
 * IMPORTANT — what this does NOT do:
 *   - It does NOT recover sensor data that wasn't in the source. The pixel
 *     values are taken from the JPEG/PNG/etc. source, scaled into the linear
 *     RGB space. There's no information advantage over the source.
 *   - It DOES produce a structurally valid DNG that other tools recognize.
 *     This is useful for:
 *       * Tools that *only* accept DNG as input (some Adobe / Capture One
 *         workflows)
 *       * Workflows where the file extension matters administratively
 *
 * The output uses an identity color matrix (assumes the source is already in
 * sRGB) and AsShotNeutral=(1,1,1) (already white-balanced).
 *
 * DNG tag set written here is the minimum required by the Adobe DNG 1.4 spec.
 */

import sharp from "sharp";

// TIFF data types per spec
const T_BYTE = 1;
const T_ASCII = 2;
const T_SHORT = 3;
const T_LONG = 4;
const T_RATIONAL = 5;
const T_SBYTE = 6;
const T_UNDEFINED = 7;
const T_SRATIONAL = 10;

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  data: Buffer; // Encoded value or pointer to extended data
  extData?: Buffer; // For values >4 bytes, written outside the 12-byte slot
}

class DngWriter {
  private entries: IfdEntry[] = [];

  addByte(tag: number, value: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt8(value, 0);
    this.entries.push({ tag, type: T_BYTE, count: 1, data: buf });
  }

  addShort(tag: number, value: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16LE(value, 0);
    this.entries.push({ tag, type: T_SHORT, count: 1, data: buf });
  }

  addShorts(tag: number, values: number[]) {
    if (values.length === 1) return this.addShort(tag, values[0]);
    const buf = Buffer.alloc(values.length * 2);
    for (let i = 0; i < values.length; i++) buf.writeUInt16LE(values[i], i * 2);
    if (buf.length <= 4) {
      const pad = Buffer.alloc(4);
      buf.copy(pad);
      this.entries.push({ tag, type: T_SHORT, count: values.length, data: pad });
    } else {
      this.entries.push({ tag, type: T_SHORT, count: values.length, data: Buffer.alloc(4), extData: buf });
    }
  }

  addLong(tag: number, value: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    this.entries.push({ tag, type: T_LONG, count: 1, data: buf });
  }

  addAscii(tag: number, str: string) {
    const data = Buffer.from(str + "\0", "ascii");
    if (data.length <= 4) {
      const pad = Buffer.alloc(4);
      data.copy(pad);
      this.entries.push({ tag, type: T_ASCII, count: data.length, data: pad });
    } else {
      this.entries.push({ tag, type: T_ASCII, count: data.length, data: Buffer.alloc(4), extData: data });
    }
  }

  addRational(tag: number, values: Array<[number, number]>) {
    const ext = Buffer.alloc(values.length * 8);
    for (let i = 0; i < values.length; i++) {
      ext.writeUInt32LE(values[i][0], i * 8);
      ext.writeUInt32LE(values[i][1], i * 8 + 4);
    }
    this.entries.push({ tag, type: T_RATIONAL, count: values.length, data: Buffer.alloc(4), extData: ext });
  }

  addSrational(tag: number, values: Array<[number, number]>) {
    const ext = Buffer.alloc(values.length * 8);
    for (let i = 0; i < values.length; i++) {
      ext.writeInt32LE(values[i][0], i * 8);
      ext.writeInt32LE(values[i][1], i * 8 + 4);
    }
    this.entries.push({ tag, type: T_SRATIONAL, count: values.length, data: Buffer.alloc(4), extData: ext });
  }

  addUndefined(tag: number, bytes: Buffer) {
    if (bytes.length <= 4) {
      const pad = Buffer.alloc(4);
      bytes.copy(pad);
      this.entries.push({ tag, type: T_UNDEFINED, count: bytes.length, data: pad });
    } else {
      this.entries.push({ tag, type: T_UNDEFINED, count: bytes.length, data: Buffer.alloc(4), extData: bytes });
    }
  }

  /** Add a tag whose value is a single LONG that points to extra data we'll provide. */
  addLongPointer(tag: number, payload: Buffer) {
    this.entries.push({ tag, type: T_LONG, count: 1, data: Buffer.alloc(4), extData: payload, /* placeholder */ });
  }

  build(): Buffer {
    // Sort entries by tag (TIFF requirement)
    this.entries.sort((a, b) => a.tag - b.tag);

    // Layout:
    //   [TIFF header 8 bytes]
    //   [IFD count (2 bytes)] [entries 12 bytes each] [next IFD offset (4 bytes)]
    //   [extData blobs]
    //   [pixel data]
    const headerSize = 8;
    const ifdSize = 2 + this.entries.length * 12 + 4;

    // Compute extData total
    let extOffset = headerSize + ifdSize;
    const extPositions: number[] = [];
    for (const e of this.entries) {
      if (e.extData) {
        extPositions.push(extOffset);
        extOffset += e.extData.length;
        // Pad to even boundary
        if (extOffset % 2) extOffset++;
      } else {
        extPositions.push(0);
      }
    }

    const totalSize = extOffset;
    const out = Buffer.alloc(totalSize);

    // Header: II*\0 + first IFD offset = 8
    out[0] = 0x49; out[1] = 0x49;
    out.writeUInt16LE(42, 2);
    out.writeUInt32LE(headerSize, 4);

    // IFD
    let p = headerSize;
    out.writeUInt16LE(this.entries.length, p); p += 2;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      out.writeUInt16LE(e.tag, p); p += 2;
      out.writeUInt16LE(e.type, p); p += 2;
      out.writeUInt32LE(e.count, p); p += 4;
      if (e.extData) {
        out.writeUInt32LE(extPositions[i], p);
        e.extData.copy(out, extPositions[i]);
      } else {
        e.data.copy(out, p, 0, 4);
      }
      p += 4;
    }
    out.writeUInt32LE(0, p); // next IFD offset = 0

    return out;
  }
}

export async function encodeDng(
  input: Buffer | Uint8Array,
  background: string,
): Promise<Buffer> {
  // Decode to 8-bit RGB pixels via sharp, flattening transparency.
  const { data, info } = await sharp(input, { failOn: "none" })
    .flatten({ background })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Build the DNG IFD
  const w = new DngWriter();
  // Required by Adobe DNG 1.4 spec for a Linear DNG (PhotometricInterpretation=34892)
  w.addLong(254, 0); // NewSubfileType: 0 = primary image
  w.addLong(256, width); // ImageWidth
  w.addLong(257, height); // ImageLength
  w.addShorts(258, [8, 8, 8]); // BitsPerSample
  w.addShort(259, 1); // Compression: 1 = uncompressed
  w.addShort(262, 34892); // PhotometricInterpretation: LinearRaw
  w.addShort(277, 3); // SamplesPerPixel: 3 (RGB)
  w.addShort(284, 1); // PlanarConfiguration: 1 = chunky (interleaved)
  w.addShort(296, 2); // ResolutionUnit: 2 = inch
  w.addRational(282, [[72, 1]]); // XResolution
  w.addRational(283, [[72, 1]]); // YResolution
  w.addAscii(305, "Flash Image Converter"); // Software

  // DNG-specific tags (Adobe DNG 1.4 spec, "Required" set)
  w.addUndefined(50706, Buffer.from([1, 4, 0, 0])); // DNGVersion: 1.4.0.0
  w.addUndefined(50707, Buffer.from([1, 1, 0, 0])); // DNGBackwardVersion: 1.1.0.0
  w.addAscii(50708, "Flash Image Converter Linear DNG"); // UniqueCameraModel

  // Color matrix: Identity (we treat input as already-sRGB-encoded pixel values)
  // ColorMatrix1: 3x3 SRATIONAL, maps XYZ -> camera reference
  w.addSrational(50721, [
    [10000, 10000], [0, 10000], [0, 10000],
    [0, 10000], [10000, 10000], [0, 10000],
    [0, 10000], [0, 10000], [10000, 10000],
  ]);
  // CalibrationIlluminant1: 21 = D65
  w.addShort(50778, 21);
  // AsShotNeutral: 1,1,1 (already white-balanced)
  w.addRational(50728, [[1, 1], [1, 1], [1, 1]]);

  // BlackLevel: 0
  w.addRational(50714, [[0, 1]]);
  // WhiteLevel: 255 (8-bit max)
  w.addLong(50717, 255);

  // BaselineExposure: 0
  w.addSrational(50730, [[0, 1]]);
  // BaselineNoise: 1.0
  w.addRational(50731, [[1, 1]]);
  // BaselineSharpness: 1.0
  w.addRational(50732, [[1, 1]]);

  // Pixel data goes into a single strip
  // Build the structure in two passes: first compute strip placement, then emit bytes.

  // We need StripOffsets and StripByteCounts. Their VALUE depends on where the
  // strip ends up in the file, which depends on how big the IFD + extData ends
  // up. Easiest correct approach: build IFD twice. First pass: compute layout.
  // Second pass: write StripOffsets pointing to the actual position.

  // Build IFD with placeholder strip offset = 0 to compute size
  const placeholderWriter = new DngWriter();
  // Re-add same tags; since we don't expose getEntries, rebuild here with the
  // strip tags appended:
  const entries = (w as unknown as { entries: IfdEntry[] }).entries.slice();
  placeholderWriter["entries"] = entries.slice();
  placeholderWriter.addLong(273, 0); // StripOffsets (placeholder)
  placeholderWriter.addLong(279, data.length); // StripByteCounts
  placeholderWriter.addLong(278, height); // RowsPerStrip = full image (single strip)

  const ifdBytes = placeholderWriter.build();
  const stripOffset = ifdBytes.length;

  // Now build the real IFD with correct StripOffsets
  const realWriter = new DngWriter();
  realWriter["entries"] = entries.slice();
  realWriter.addLong(273, stripOffset); // StripOffsets
  realWriter.addLong(279, data.length); // StripByteCounts
  realWriter.addLong(278, height); // RowsPerStrip

  const realIfd = realWriter.build();
  // Sanity: real IFD should be the same size as placeholder
  // (the strip offset is just a uint32 either way; layout invariant)

  return Buffer.concat([realIfd, data]);
}

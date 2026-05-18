/**
 * Shared sharp pipeline used by /api/convert and /api/convert-dng.
 * Applies (in order):
 *   1. autoOrient    -> rotate per EXIF Orientation tag, then strip the tag
 *   2. rotate        -> additional 0/90/180/270 user-specified rotation
 *   3. resize        -> width/height + fit mode + background fill
 *   4. flatten       -> flatten transparency onto background when target is opaque
 *   5. encode        -> sharp-native (jpeg/png/webp/avif/tiff/gif) OR custom (bmp/ico/pdf)
 *   6. metadata      -> withMetadata() vs strip
 */

import sharp from "sharp";
import {
  type ConvertOptions,
  type CropPosition,
  type OutputFormat,
  type ResizeFit,
  type WatermarkPosition,
} from "@/lib/formats";
import { encodeBmp } from "@/lib/encoders/bmp";
import { encodeIco } from "@/lib/encoders/ico";
import { encodePdf } from "@/lib/encoders/pdf";
import { encodeDng } from "@/lib/encoders/dng";
import { encodeSvg } from "@/lib/encoders/svg";
import { applyWatermark } from "@/lib/encoders/watermark";
import { decodeBmp } from "@/lib/decoders/bmp";
import { decodeIco } from "@/lib/decoders/ico";
// NOTE: PDF input via pdfjs-dist + node-canvas is unstable on Vercel's
// serverless runtime. PDF stays output-only for now. Decoder file remains
// in src/lib/decoders/pdf.ts as a starting point for a future revisit.

/**
 * Decode formats sharp can't natively read, returning a sharp-friendly buffer
 * (PNG). Returns the original input unchanged if it's already sharp-native.
 */
async function decodeIfNeeded(input: Buffer | Uint8Array): Promise<Buffer | Uint8Array> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 4) return input;

  // BMP: 'BM'
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return decodeBmp(buf);
  }
  // ICO: reserved=0, type=1
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return decodeIco(buf);
  }
  return input;
}

interface BuildPipelineArgs {
  input: Buffer | Uint8Array;
  format: OutputFormat;
  options: ConvertOptions;
  /** When true, sharp.animated=true so GIF/WebP animations are preserved. */
  animated?: boolean;
}

const ROTATABLE = new Set([0, 90, 180, 270]);
const VALID_CROP_POSITIONS = new Set<CropPosition>([
  "center", "attention", "entropy", "top", "right", "bottom", "left",
]);
const VALID_WATERMARK_POSITIONS = new Set<WatermarkPosition>([
  "tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br",
]);

/** Map our crop position -> sharp position string/strategy. */
function sharpPositionFor(cp: CropPosition | undefined): string | number {
  switch (cp) {
    case "attention": return sharp.strategy.attention;
    case "entropy":   return sharp.strategy.entropy;
    case "top":       return "top";
    case "right":     return "right";
    case "bottom":    return "bottom";
    case "left":      return "left";
    case "center":
    default:          return "center";
  }
}

/** Formats that sharp encodes natively. The others go through custom encoders. */
const SHARP_NATIVE: ReadonlySet<OutputFormat> = new Set([
  "jpeg",
  "png",
  "webp",
  "avif",
  "tiff",
  "gif",
]);

function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
}

function safeBackground(v: string): string {
  return isHexColor(v) ? v : "#ffffff";
}

/**
 * @deprecated kept for type compatibility but no longer used internally.
 * Use convertWithPipeline() instead — it correctly handles auto-orient + manual rotate.
 */

export async function convertWithPipeline(args: BuildPipelineArgs): Promise<Buffer> {
  const { input, format, options, animated } = args;
  const bg = safeBackground(options.background);

  // Stage 0: pre-decode formats sharp can't read (BMP/ICO/PDF) into PNG
  // so the rest of the pipeline can treat them like any other input.
  let buf: Buffer | Uint8Array = await decodeIfNeeded(input);

  // Stage 1+2: auto-orient (if requested) and manual rotate need to be
  // separated because sharp.rotate() with and without args target the same
  // internal "rotation" state — the second call wins. So we materialize after
  // autoOrient when both are needed.

  if (options.autoOrient) {
    buf = await sharp(buf, { failOn: "none", animated: animated ?? format === "gif" })
      .rotate() // applies and resets EXIF Orientation
      .toBuffer();
  }

  // Stages 2-4 (rotate, resize, flatten if needed) happen via a sharp pipeline
  // that produces a PNG buffer. Native formats then re-encode to their target;
  // special formats (BMP/ICO/PDF) take the PNG buffer and run a custom encoder.
  const isNative = SHARP_NATIVE.has(format);

  let pipeline = sharp(buf, { failOn: "none", animated: animated ?? format === "gif" });

  // 2. Manual rotation
  const rot = options.rotate ?? 0;
  if (ROTATABLE.has(rot) && rot !== 0) {
    pipeline = pipeline.rotate(rot, { background: bg });
  }

  // 3. Resize
  const r = options.resize;
  if (r && (r.width || r.height)) {
    const fit: ResizeFit = r.fit ?? "inside";
    pipeline = pipeline.resize({
      width: r.width || undefined,
      height: r.height || undefined,
      fit,
      position: fit === "cover" ? sharpPositionFor(r.position) : undefined,
      withoutEnlargement: true,
      background: bg,
    });
  }

  // 4. Flatten transparency for opaque targets (JPEG, BMP, PDF — all opaque)
  if (format === "jpeg" || format === "bmp" || format === "pdf") {
    pipeline = pipeline.flatten({ background: bg });
  }

  // 4b. Watermark (after rotate/resize/flatten so it sits on the final pixels).
  // We must materialize to a buffer because composite needs a concrete image.
  if (options.watermark && options.watermark.text.trim() !== "") {
    const intermediate = await pipeline.png().toBuffer();
    const watermarked = await applyWatermark(intermediate, options.watermark);
    pipeline = sharp(watermarked, { failOn: "none" });
  }

  // 5. Encode
  const q = Math.min(100, Math.max(1, Math.round(options.quality)));

  if (!isNative) {
    // Materialize a PNG buffer carrying all the transforms, then hand to
    // the custom encoder.
    const intermediate = await pipeline.png().toBuffer();
    if (format === "bmp") return encodeBmp(intermediate, bg);
    if (format === "ico") return encodeIco(intermediate);
    if (format === "pdf") return encodePdf(intermediate, q, bg);
    if (format === "dng") return encodeDng(intermediate, bg);
    if (format === "svg") return encodeSvg(intermediate);
  }

  switch (format) {
    case "jpeg":
      pipeline = pipeline.jpeg({ quality: q, mozjpeg: true });
      break;
    case "png":
      pipeline = pipeline.png({ compressionLevel: 9, palette: q < 80 });
      break;
    case "webp":
      pipeline = pipeline.webp({ quality: q });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality: q, effort: 4 });
      break;
    case "tiff":
      pipeline = pipeline.tiff({ compression: "lzw", quality: q });
      break;
    case "gif":
      pipeline = pipeline.gif();
      break;
  }

  // 6. Metadata
  if (!options.stripMetadata) {
    pipeline = pipeline.withMetadata();
  }

  return pipeline.toBuffer();
}

/** Coerce arbitrary unknown input from a request into a sane ConvertOptions. */
export function parseOptions(raw: Record<string, unknown>): ConvertOptions {
  const num = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const bool = (v: unknown, fb: boolean) => {
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
    return fb;
  };
  const fitVal = String(raw.resizeFit ?? "inside");
  const fit: ResizeFit =
    fitVal === "cover" || fitVal === "contain" ? fitVal : "inside";

  const w = Math.max(0, Math.round(num(raw.resizeWidth, 0)));
  const h = Math.max(0, Math.round(num(raw.resizeHeight, 0)));

  const posVal = String(raw.cropPosition ?? "center");
  const position: CropPosition = VALID_CROP_POSITIONS.has(posVal as CropPosition)
    ? (posVal as CropPosition)
    : "center";

  const resize = w || h
    ? { width: w || undefined, height: h || undefined, fit, position }
    : undefined;

  const rotateVal = Math.round(num(raw.rotate, 0));
  const rotate = ROTATABLE.has(rotateVal) ? rotateVal : 0;

  // Watermark — only build the object if text is non-empty
  const wmText = String(raw.watermarkText ?? "").trim();
  const watermark = wmText
    ? {
        text: wmText.slice(0, 200),
        position: VALID_WATERMARK_POSITIONS.has(String(raw.watermarkPosition ?? "br") as WatermarkPosition)
          ? (String(raw.watermarkPosition ?? "br") as WatermarkPosition)
          : "br",
        opacity: Math.min(100, Math.max(0, Math.round(num(raw.watermarkOpacity, 60)))),
        fontSize: Math.min(20, Math.max(0.5, num(raw.watermarkFontSize, 4))),
        color: safeBackground(String(raw.watermarkColor ?? "#ffffff")),
      }
    : undefined;

  return {
    quality: Math.min(100, Math.max(1, Math.round(num(raw.quality, 85)))),
    resize,
    rotate,
    autoOrient: bool(raw.autoOrient, true),
    stripMetadata: bool(raw.stripMetadata, true),
    background: safeBackground(String(raw.background ?? "#ffffff")),
    watermark,
  };
}

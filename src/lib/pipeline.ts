/**
 * Shared sharp pipeline used by /api/convert and /api/convert-dng.
 * Applies (in order):
 *   1. autoOrient    -> rotate per EXIF Orientation tag, then strip the tag
 *   2. rotate        -> additional 0/90/180/270 user-specified rotation
 *   3. resize        -> width/height + fit mode + background fill
 *   4. flatten       -> flatten transparency onto background when target is JPEG
 *   5. encode        -> encode to target format with quality
 *   6. metadata      -> withMetadata() vs strip
 */

import sharp, { type Sharp } from "sharp";
import {
  type ConvertOptions,
  type OutputFormat,
  type ResizeFit,
} from "@/lib/formats";

interface BuildPipelineArgs {
  input: Buffer | Uint8Array;
  format: OutputFormat;
  options: ConvertOptions;
  /** When true, sharp.animated=true so GIF/WebP animations are preserved. */
  animated?: boolean;
}

const ROTATABLE = new Set([0, 90, 180, 270]);

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
export function buildPipeline({
  input,
  format,
  options,
  animated,
}: BuildPipelineArgs): Sharp {
  let pipeline = sharp(input, { failOn: "none", animated: animated ?? format === "gif" });

  if (options.autoOrient) {
    pipeline = pipeline.rotate();
  }

  const rot = options.rotate ?? 0;
  if (ROTATABLE.has(rot) && rot !== 0) {
    pipeline = pipeline.rotate(rot, { background: safeBackground(options.background) });
  }

  const r = options.resize;
  if (r && (r.width || r.height)) {
    pipeline = pipeline.resize({
      width: r.width || undefined,
      height: r.height || undefined,
      fit: r.fit ?? "inside",
      withoutEnlargement: true,
      background: safeBackground(options.background),
    });
  }

  if (format === "jpeg") {
    pipeline = pipeline.flatten({ background: safeBackground(options.background) });
  }

  const q = Math.min(100, Math.max(1, Math.round(options.quality)));
  switch (format) {
    case "jpeg": pipeline = pipeline.jpeg({ quality: q, mozjpeg: true }); break;
    case "png":  pipeline = pipeline.png({ compressionLevel: 9, palette: q < 80 }); break;
    case "webp": pipeline = pipeline.webp({ quality: q }); break;
    case "avif": pipeline = pipeline.avif({ quality: q, effort: 4 }); break;
    case "tiff": pipeline = pipeline.tiff({ compression: "lzw", quality: q }); break;
    case "gif":  pipeline = pipeline.gif(); break;
  }

  if (!options.stripMetadata) {
    pipeline = pipeline.withMetadata();
  }

  return pipeline;
}

export async function convertWithPipeline(args: BuildPipelineArgs): Promise<Buffer> {
  const { input, format, options, animated } = args;
  const bg = safeBackground(options.background);

  // Stage 1: auto-orient (if requested) and stage 2: manual rotate need to be
  // separated because sharp.rotate() with and without args target the same
  // internal "rotation" state — the second call wins. So we materialize after
  // autoOrient when both are needed.
  let buf: Buffer | Uint8Array = input as Buffer;

  if (options.autoOrient) {
    buf = await sharp(buf, { failOn: "none", animated: animated ?? format === "gif" })
      .rotate() // applies and resets EXIF Orientation
      .toBuffer();
  }

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
      withoutEnlargement: true,
      background: bg,
    });
  }

  // 4. Flatten transparency for opaque targets
  if (format === "jpeg") {
    pipeline = pipeline.flatten({ background: bg });
  }

  // 5. Encode
  const q = Math.min(100, Math.max(1, Math.round(options.quality)));
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
  const resize = w || h ? { width: w || undefined, height: h || undefined, fit } : undefined;

  const rotateVal = Math.round(num(raw.rotate, 0));
  const rotate = ROTATABLE.has(rotateVal) ? rotateVal : 0;

  return {
    quality: Math.min(100, Math.max(1, Math.round(num(raw.quality, 85)))),
    resize,
    rotate,
    autoOrient: bool(raw.autoOrient, true),
    stripMetadata: bool(raw.stripMetadata, true),
    background: safeBackground(String(raw.background ?? "#ffffff")),
  };
}

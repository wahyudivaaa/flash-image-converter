/**
 * SVG encoder via imagetracerjs.
 *
 * Important context:
 *   - Vector tracing of a photo produces a HUGE SVG (megabytes, thousands of
 *     paths) and the result usually looks worse than the input. SVG output is
 *     genuinely useful only for icon-/logo-shaped images: solid colors, sharp
 *     edges, few distinct regions.
 *   - We expose a "preset" that tunes imagetracerjs for the common case of
 *     "logo / icon" — high `pathomit`, low color count, low precision.
 *   - For Vercel, we cap input dimensions at 1024px before tracing so memory
 *     stays bounded and the trace finishes within the function timeout.
 */

import sharp from "sharp";

// imagetracerjs has no types
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ImageTracer from "imagetracerjs";

const MAX_TRACE_DIMENSION = 1024;

interface ImageTracerOptions {
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  rightangleenhance?: boolean;
  colorsampling?: 0 | 1 | 2;
  numberofcolors?: number;
  mincolorratio?: number;
  colorquantcycles?: number;
  layering?: 0 | 1;
  strokewidth?: number;
  linefilter?: boolean;
  scale?: number;
  roundcoords?: number;
  viewbox?: boolean;
  desc?: boolean;
  blurradius?: number;
  blurdelta?: number;
}

const PRESET_LOGO: ImageTracerOptions = {
  ltres: 0.1,
  qtres: 1,
  pathomit: 12,
  rightangleenhance: true,
  colorsampling: 2,
  numberofcolors: 8,
  mincolorratio: 0.02,
  colorquantcycles: 3,
  blurradius: 0,
  blurdelta: 20,
  layering: 0,
  strokewidth: 1,
  linefilter: false,
  scale: 1,
  roundcoords: 1,
  viewbox: true,
  desc: false,
};

interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Encode raster image bytes to an SVG string buffer.
 *
 * The SVG is text — sharp's pipeline expects bytes, so we wrap as a UTF-8
 * Buffer at the end. Downstream code in the API route serves this with
 * Content-Type image/svg+xml.
 */
export async function encodeSvg(input: Buffer | Uint8Array): Promise<Buffer> {
  // Decode to raw RGBA via sharp, downscaling if too large.
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const w0 = meta.width ?? 0;
  const h0 = meta.height ?? 0;
  if (w0 === 0 || h0 === 0) throw new Error("invalid image dimensions");

  let pipe = sharp(input, { failOn: "none" });
  if (Math.max(w0, h0) > MAX_TRACE_DIMENSION) {
    pipe = pipe.resize({
      width: w0 >= h0 ? MAX_TRACE_DIMENSION : undefined,
      height: h0 > w0 ? MAX_TRACE_DIMENSION : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const imageData: ImageData = {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };

  // imagetracerjs ships as CommonJS; we already imported it at top.
  // Its `imagedataToSVG(imgd, options)` is synchronous.
  const svgString: string = (ImageTracer as { imagedataToSVG: (d: ImageData, opts: ImageTracerOptions) => string })
    .imagedataToSVG(imageData, PRESET_LOGO);

  return Buffer.from(svgString, "utf-8");
}

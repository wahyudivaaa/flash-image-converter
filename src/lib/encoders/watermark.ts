/**
 * Text watermark via SVG → sharp composite.
 *
 * Strategy:
 *   1. Build an SVG sized to the image, with a single <text> element placed
 *      according to the requested 9-grid position.
 *   2. Sharp composite the SVG over the image.
 *
 * Why SVG: text is anti-aliased nicely, no font files to ship, and sharp can
 * rasterize SVG natively via librsvg.
 *
 * Font: we use a generic system stack. librsvg falls back to its built-in
 * fallback if the chosen family is unavailable on the Vercel function runtime.
 */

import sharp from "sharp";
import type { WatermarkOptions, WatermarkPosition } from "@/lib/formats";

interface PositionAnchor {
  x: number;        // 0..1, fraction of width
  y: number;        // 0..1, fraction of height
  textAnchor: "start" | "middle" | "end";
  baseline: "hanging" | "central" | "alphabetic";
}

const POSITION_MAP: Record<WatermarkPosition, PositionAnchor> = {
  tl: { x: 0.02, y: 0.04, textAnchor: "start",  baseline: "hanging"   },
  tc: { x: 0.50, y: 0.04, textAnchor: "middle", baseline: "hanging"   },
  tr: { x: 0.98, y: 0.04, textAnchor: "end",    baseline: "hanging"   },
  ml: { x: 0.02, y: 0.50, textAnchor: "start",  baseline: "central"   },
  mc: { x: 0.50, y: 0.50, textAnchor: "middle", baseline: "central"   },
  mr: { x: 0.98, y: 0.50, textAnchor: "end",    baseline: "central"   },
  bl: { x: 0.02, y: 0.96, textAnchor: "start",  baseline: "alphabetic"},
  bc: { x: 0.50, y: 0.96, textAnchor: "middle", baseline: "alphabetic"},
  br: { x: 0.98, y: 0.96, textAnchor: "end",    baseline: "alphabetic"},
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Apply watermark to a sharp pipeline. Caller passes in the current pipeline
 * after rotate+resize+flatten, before final encode. We measure the working
 * dimensions, build the SVG, composite it, return the new pipeline (still
 * pre-encode).
 */
export async function applyWatermark(
  buf: Buffer,
  watermark: WatermarkOptions,
): Promise<Buffer> {
  if (!watermark.text || watermark.text.trim() === "") return buf;

  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w === 0 || h === 0) return buf;

  const anchor = POSITION_MAP[watermark.position] ?? POSITION_MAP.br;
  const fontSizePct = clamp(watermark.fontSize, 0.5, 30);
  const fontSizePx = Math.round((Math.min(w, h) * fontSizePct) / 100);
  const opacity = clamp(watermark.opacity, 0, 100) / 100;
  const text = escapeXml(watermark.text);

  // Soft text shadow improves legibility on busy backgrounds without being
  // harsh. Render the text twice — once as a slightly offset dark shadow,
  // once as the main color.
  const x = anchor.x * w;
  const y = anchor.y * h;
  const shadowOpacity = (opacity * 0.6).toFixed(3);
  const fillOpacity = opacity.toFixed(3);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <style>
    .wm {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-weight: 600;
      font-size: ${fontSizePx}px;
      text-anchor: ${anchor.textAnchor};
      dominant-baseline: ${anchor.baseline};
    }
  </style>
  <text class="wm" x="${x}" y="${y}" fill="#000000" fill-opacity="${shadowOpacity}" transform="translate(2,2)">${text}</text>
  <text class="wm" x="${x}" y="${y}" fill="${watermark.color}" fill-opacity="${fillOpacity}">${text}</text>
</svg>`.trim();

  const svgBuffer = Buffer.from(svg);

  return sharp(buf, { failOn: "none" })
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .toBuffer();
}

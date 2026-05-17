/**
 * Supported image format definitions.
 * sharp's TIFF / JPEG / PNG / WebP / AVIF / GIF are all available out of the box on Vercel.
 * SVG is input-only (sharp rasterizes it; cannot output vector).
 */

export type OutputFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "tiff"
  | "gif";

export type InputFormat = OutputFormat | "svg";

export interface FormatMeta {
  id: OutputFormat;
  label: string;
  ext: string;
  mime: string;
  /** quality slider applies */
  lossy: boolean;
  /** UX hint */
  hint: string;
}

export const OUTPUT_FORMATS: readonly FormatMeta[] = [
  {
    id: "jpeg",
    label: "JPEG",
    ext: "jpg",
    mime: "image/jpeg",
    lossy: true,
    hint: "Foto, ukuran kecil, tidak transparan",
  },
  {
    id: "png",
    label: "PNG",
    ext: "png",
    mime: "image/png",
    lossy: false,
    hint: "Lossless, transparansi, ikon",
  },
  {
    id: "webp",
    label: "WebP",
    ext: "webp",
    mime: "image/webp",
    lossy: true,
    hint: "Modern, kecil + transparan",
  },
  {
    id: "avif",
    label: "AVIF",
    ext: "avif",
    mime: "image/avif",
    lossy: true,
    hint: "Kompresi terbaik, lebih lambat",
  },
  {
    id: "tiff",
    label: "TIFF",
    ext: "tiff",
    mime: "image/tiff",
    lossy: false,
    hint: "Print, arsip, multi-layer",
  },
  {
    id: "gif",
    label: "GIF",
    ext: "gif",
    mime: "image/gif",
    lossy: false,
    hint: "Animasi sederhana, palet 256",
  },
] as const;

/** Accept attribute for <input type="file"> */
export const ACCEPT_INPUT =
  "image/jpeg,image/png,image/webp,image/avif,image/tiff,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,.gif,.svg";

/** Vercel hard cap on request body */
export const MAX_BYTES = 4.5 * 1024 * 1024;

export function formatById(id: string): FormatMeta | undefined {
  return OUTPUT_FORMATS.find((f) => f.id === id);
}

export function isOutputFormat(value: string): value is OutputFormat {
  return OUTPUT_FORMATS.some((f) => f.id === value);
}

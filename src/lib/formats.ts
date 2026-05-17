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
  "image/jpeg,image/png,image/webp,image/avif,image/tiff,image/gif,image/svg+xml,image/x-adobe-dng,image/dng,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,.gif,.svg,.dng";

/** Vercel hard cap on request body */
export const MAX_BYTES = 4.5 * 1024 * 1024;

/** Max upload via Vercel Blob direct upload (DNG path). 60 MB covers phone DNGs. */
export const MAX_BLOB_BYTES = 60 * 1024 * 1024;

/** Detect whether a file should use the blob/DNG flow rather than the standard /api/convert. */
export function isDngFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".dng")) return true;
  // Some uploaders set type to image/x-adobe-dng or image/dng; others leave it empty.
  if (file.type === "image/x-adobe-dng" || file.type === "image/dng") return true;
  return false;
}

/**
 * Resize options. When neither width nor height is provided we skip resizing.
 * "fit" follows sharp's resize fit modes:
 *  - inside  : preserve aspect, image fits within bounds (the safe default)
 *  - cover   : crop to fill bounds exactly
 *  - contain : letterbox to fit bounds (requires bg)
 */
export type ResizeFit = "inside" | "cover" | "contain";

export interface ResizeOptions {
  width?: number;
  height?: number;
  fit: ResizeFit;
}

/**
 * Per-job options applied during conversion. All optional with sensible defaults.
 */
export interface ConvertOptions {
  quality: number;            // 1..100, used by lossy formats
  resize?: ResizeOptions;     // omit = no resize
  rotate?: number;            // 0 | 90 | 180 | 270; "auto" = handled by autoOrient
  autoOrient: boolean;        // honor EXIF Orientation tag
  stripMetadata: boolean;     // strip EXIF/IPTC/XMP from output
  background: string;         // CSS color used when flattening transparency to opaque
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  quality: 85,
  resize: undefined,
  rotate: 0,
  autoOrient: true,
  stripMetadata: true,
  background: "#ffffff",
};

/** Predefined size presets for the UI. */
export const RESIZE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  width?: number;
  height?: number;
  fit: ResizeFit;
}> = [
  { id: "none", label: "Tanpa resize", fit: "inside" },
  { id: "fit-1920", label: "Max 1920px (Full HD)", width: 1920, height: 1920, fit: "inside" },
  { id: "fit-1280", label: "Max 1280px (HD)", width: 1280, height: 1280, fit: "inside" },
  { id: "fit-800", label: "Max 800px (web)", width: 800, height: 800, fit: "inside" },
  { id: "fit-512", label: "Max 512px (thumbnail)", width: 512, height: 512, fit: "inside" },
  { id: "ig-square", label: "Instagram Square 1080×1080", width: 1080, height: 1080, fit: "cover" },
  { id: "ig-portrait", label: "Instagram Portrait 1080×1350", width: 1080, height: 1350, fit: "cover" },
  { id: "fb-cover", label: "Facebook Cover 820×312", width: 820, height: 312, fit: "cover" },
  { id: "tw-card", label: "X / Twitter Card 1200×675", width: 1200, height: 675, fit: "cover" },
] as const;

export function formatById(id: string): FormatMeta | undefined {
  return OUTPUT_FORMATS.find((f) => f.id === id);
}

export function isOutputFormat(value: string): value is OutputFormat {
  return OUTPUT_FORMATS.some((f) => f.id === value);
}

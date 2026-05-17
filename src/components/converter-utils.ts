import type { OutputFormat } from "@/lib/formats";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  file: File;
  status: JobStatus;
  format: OutputFormat;
  quality: number;
  outputUrl?: string;
  outputName?: string;
  outputSize?: number;
  error?: string;
  /** Cached small JPEG data URL for the input file. Generated once after add. */
  thumbUrl?: string;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Output formats that browsers can render via <img>. AVIF support is patchy, so excluded. */
export const OUTPUT_PREVIEWABLE: ReadonlySet<OutputFormat> = new Set([
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
]);

/** Best-effort source format from filename. Pure UI, never used by API. */
export function sourceLabel(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "tif" || ext === "tiff") return "TIFF";
  if (ext === "svg") return "SVG";
  if (ext === "dng") return "DNG";
  if (ext) return ext.toUpperCase();
  return "IMG";
}

/**
 * Generate a small (max ~96px) JPEG data URL preview for an image file.
 * Returns null when the browser can't decode it (e.g. DNG, oversized) so callers
 * can fall back to a badge.
 */
export async function generateThumb(file: File): Promise<string | null> {
  if (file.size > 25 * 1024 * 1024) return null;
  if (/\.dng$/i.test(file.name)) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(val);
    };
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const target = 96;
        const scale = Math.min(target / img.width, target / img.height, 1);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

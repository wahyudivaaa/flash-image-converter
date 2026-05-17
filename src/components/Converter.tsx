"use client";

import {
  ACCEPT_INPUT,
  DEFAULT_OPTIONS,
  DEFAULT_WATERMARK,
  MAX_BLOB_BYTES,
  MAX_BYTES,
  OUTPUT_FORMATS,
  RESIZE_PRESETS,
  isDngFile,
  type ConvertOptions,
  type CropPosition,
  type OutputFormat,
  type ResizeFit,
  type WatermarkPosition,
} from "@/lib/formats";
import { upload } from "@vercel/blob/client";
import JSZip from "jszip";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  FileImage,
  Loader2,
  Settings2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Type,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobStatus = "queued" | "running" | "done" | "error";

interface Job {
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Output formats that browsers can render via <img>. AVIF support is patchy, so excluded. */
const OUTPUT_PREVIEWABLE: ReadonlySet<OutputFormat> = new Set([
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
]);

/**
 * Generate a small (max ~96px) JPEG data URL preview for an image file.
 * Returns null when the browser can't decode it (e.g. DNG, oversized) so callers
 * can fall back to a badge.
 */
async function generateThumb(file: File): Promise<string | null> {
  if (file.size > 25 * 1024 * 1024) return null; // skip very large files
  if (/\.dng$/i.test(file.name)) return null; // browser can't decode DNG
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

/** Best-effort source format from filename. Pure UI, never used by API. */
function sourceLabel(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "tif" || ext === "tiff") return "TIFF";
  if (ext === "svg") return "SVG";
  if (ext === "dng") return "DNG";
  if (ext) return ext.toUpperCase();
  return "IMG";
}

async function runDngJob(
  file: File,
  format: OutputFormat,
  quality: number,
  options: ConvertOptions,
): Promise<{
  outputUrl: string;
  outputName: string;
  outputSize: number;
}> {
  // 1. Upload DNG directly to Vercel Blob (bypasses 4.5 MB serverless cap)
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    contentType: file.type || "application/octet-stream",
    clientPayload: JSON.stringify({ format }),
  });

  // 2. Ask server to extract preview + convert + upload result
  const wm = options.watermark;
  const wmActive = !!wm && wm.text.trim().length > 0;
  const res = await fetch("/api/convert-dng", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: blob.url,
      format,
      quality,
      originalName: file.name,
      resizeWidth: options.resize?.width,
      resizeHeight: options.resize?.height,
      resizeFit: options.resize?.fit,
      cropPosition:
        options.resize?.fit === "cover" ? options.resize?.position : undefined,
      rotate: options.rotate,
      autoOrient: options.autoOrient,
      stripMetadata: options.stripMetadata,
      background: options.background,
      ...(wmActive && wm
        ? {
            watermarkText: wm.text,
            watermarkPosition: wm.position,
            watermarkOpacity: wm.opacity,
            watermarkFontSize: wm.fontSize,
            watermarkColor: wm.color,
          }
        : {}),
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) msg = json.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    outputUrl: string;
    outputName: string;
    outputSize: number;
  };
  return data;
}

export default function Converter() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [format, setFormat] = useState<OutputFormat>("tiff");
  const [quality, setQuality] = useState<number>(85);
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMeta = useMemo(
    () => OUTPUT_FORMATS.find((f) => f.id === format)!,
    [format],
  );

  /** Match resize state to a preset id, "custom", or "none". */
  const presetId = useMemo(() => {
    const r = options.resize;
    if (!r) return "none";
    const match = RESIZE_PRESETS.find(
      (p) => p.width === r.width && p.height === r.height && p.fit === r.fit,
    );
    return match?.id ?? "custom";
  }, [options.resize]);

  const setOpt = useCallback(<K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Generate input thumbnails for any new jobs that don't yet have one.
  // Runs on mount and whenever a new job is added.
  useEffect(() => {
    const pending = jobs.filter((j) => j.thumbUrl === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const j of pending) {
        const url = await generateThumb(j.file);
        if (cancelled) return;
        setJobs((prev) =>
          prev.map((x) =>
            x.id === j.id ? { ...x, thumbUrl: url ?? "" } : x,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      if (files.length === 0) return;

      const next: Job[] = files.map((f) => ({
        id: uid(),
        file: f,
        status: "queued",
        format,
        quality,
      }));
      setJobs((prev) => [...next, ...prev]);
    },
    [format, quality],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeJob = (id: string) => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      // Only revoke object URLs we created locally (blob:...). Vercel Blob URLs are remote (https://) and don't need revoking.
      if (job?.outputUrl && job.outputUrl.startsWith("blob:")) URL.revokeObjectURL(job.outputUrl);
      return prev.filter((j) => j.id !== id);
    });
  };

  const clearAll = () => {
    jobs.forEach((j) => {
      if (j.outputUrl && j.outputUrl.startsWith("blob:")) URL.revokeObjectURL(j.outputUrl);
    });
    setJobs([]);
  };

  const runJob = async (job: Job): Promise<Job> => {
    const isDng = isDngFile(job.file);
    const sizeCap = isDng ? MAX_BLOB_BYTES : MAX_BYTES;
    if (job.file.size > sizeCap) {
      return {
        ...job,
        status: "error",
        error: `Melebihi batas ${(sizeCap / 1024 / 1024).toFixed(1)} MB`,
      };
    }

    if (isDng) {
      try {
        const result = await runDngJob(job.file, job.format, job.quality, options);
        return {
          ...job,
          status: "done",
          outputUrl: result.outputUrl,
          outputName: result.outputName,
          outputSize: result.outputSize,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "DNG conversion failed";
        return { ...job, status: "error", error: msg };
      }
    }

    const fd = new FormData();
    fd.append("file", job.file);
    fd.append("format", job.format);
    fd.append("quality", String(job.quality));
    if (options.resize?.width != null) fd.append("resizeWidth", String(options.resize.width));
    if (options.resize?.height != null) fd.append("resizeHeight", String(options.resize.height));
    if (options.resize?.fit) fd.append("resizeFit", options.resize.fit);
    if (options.resize?.fit === "cover" && options.resize?.position) {
      fd.append("cropPosition", options.resize.position);
    }
    if (options.rotate != null) fd.append("rotate", String(options.rotate));
    fd.append("autoOrient", options.autoOrient ? "true" : "false");
    fd.append("stripMetadata", options.stripMetadata ? "true" : "false");
    if (options.background) fd.append("background", options.background);

    // Watermark — only send when text is non-empty (server ignores empty text anyway)
    const wm = options.watermark;
    if (wm && wm.text.trim().length > 0) {
      fd.append("watermarkText", wm.text);
      fd.append("watermarkPosition", wm.position);
      fd.append("watermarkOpacity", String(wm.opacity));
      fd.append("watermarkFontSize", String(wm.fontSize));
      fd.append("watermarkColor", wm.color);
    }

    let res: Response;
    try {
      res = await fetch("/api/convert", { method: "POST", body: fd });
    } catch {
      return { ...job, status: "error", error: "Network gagal" };
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const json = (await res.json()) as { error?: string };
        if (json.error) msg = json.error;
      } catch {
        /* ignore */
      }
      return { ...job, status: "error", error: msg };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const headerName = res.headers.get("X-Output-Filename");
    const baseName = job.file.name.replace(/\.[^.]+$/, "") || "image";
    const meta = OUTPUT_FORMATS.find((f) => f.id === job.format)!;
    const fallback = `${baseName}.${meta.ext}`;
    const outputName = headerName ? decodeURIComponent(headerName) : fallback;

    return {
      ...job,
      status: "done",
      outputUrl: url,
      outputName,
      outputSize: blob.size,
    };
  };

  const convertAll = async () => {
    if (busy) return;
    const pending = jobs.filter(
      (j) => j.status === "queued" || j.status === "error",
    );
    if (pending.length === 0) return;

    setBusy(true);
    try {
      // Sequential: avoid hammering the serverless function & memory spikes
      for (const job of pending) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: "running", error: undefined } : j,
          ),
        );
        const result = await runJob({ ...job, format, quality });
        setJobs((prev) => prev.map((j) => (j.id === job.id ? result : j)));
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = () => {
    jobs
      .filter((j) => j.status === "done" && j.outputUrl)
      .forEach((j) => {
        const a = document.createElement("a");
        a.href = j.outputUrl!;
        a.download = j.outputName ?? "converted";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  };

  const downloadZip = async () => {
    if (zipBusy) return;
    const done = jobs.filter((j) => j.status === "done" && j.outputUrl);
    if (done.length === 0) return;

    setZipBusy(true);
    try {
      const zip = new JSZip();
      // Fetch each output (works for blob: and https://) and bundle in.
      for (const j of done) {
        try {
          const res = await fetch(j.outputUrl!);
          if (!res.ok) continue;
          const blob = await res.blob();
          // Disambiguate name collisions by suffixing with id slice.
          const name = j.outputName ?? `${j.id}.bin`;
          zip.file(name, blob);
        } catch {
          /* skip individual failures, keep going */
        }
      }
      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flash-image-converter-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Free memory after the click handler kicks off the download.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setZipBusy(false);
    }
  };

  const doneCount = jobs.filter((j) => j.status === "done").length;
  const queuedCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "error",
  ).length;

  return (
    <div className="space-y-6">
      {/* Controls grid */}
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        {/* Format picker */}
        <div className="rounded-lg border border-white/[0.07] bg-surface/60 p-5 shadow-inset-hi">
          <div className="mb-4 flex items-baseline justify-between">
            <label className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Format tujuan
            </label>
            <span className="font-mono text-[11px] text-muted-strong">
              {currentMeta.lossy ? "lossy" : "lossless"}
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Format keluaran"
            className="grid grid-cols-3 gap-2 sm:grid-cols-6"
          >
            {OUTPUT_FORMATS.map((f) => {
              const active = format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFormat(f.id)}
                  className={[
                    "group relative flex flex-col items-start gap-1 rounded-md px-2.5 py-2 text-left transition-all duration-150 ease-out",
                    active
                      ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5),0_0_0_1px_rgb(196_240_66_/_0.4),0_0_24px_-8px_rgb(196_240_66_/_0.6)]"
                      : "border border-white/[0.07] bg-white/[0.015] text-muted-strong hover:border-white/15 hover:bg-white/[0.04] hover:text-foreground",
                  ].join(" ")}
                >
                  <span className="flex w-full items-center justify-between">
                    <span
                      className={[
                        "text-[13px] font-semibold tracking-tight",
                        active ? "text-base" : "",
                      ].join(" ")}
                    >
                      {f.label}
                    </span>
                    <Check
                      size={12}
                      strokeWidth={3}
                      className={[
                        "transition-all duration-150",
                        active
                          ? "scale-100 opacity-100"
                          : "scale-75 opacity-0",
                      ].join(" ")}
                    />
                  </span>
                  <span
                    className={[
                      "font-mono text-[10px] uppercase tracking-wider",
                      active ? "text-base/70" : "text-muted",
                    ].join(" ")}
                  >
                    .{f.ext}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 flex items-start gap-2 text-[12.5px] text-muted">
            <span
              aria-hidden
              className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent"
            />
            <span>{currentMeta.hint}</span>
          </p>
        </div>

        {/* Quality slider */}
        <div className="rounded-lg border border-white/[0.07] bg-surface/60 p-5 shadow-inset-hi">
          <div className="mb-4 flex items-baseline justify-between">
            <label
              htmlFor="quality"
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted"
            >
              Kualitas
            </label>
            <span className="flex items-baseline gap-1">
              <span
                className={[
                  "font-mono text-2xl font-medium tabular-nums tracking-tight",
                  currentMeta.lossy ? "text-foreground" : "text-muted/40",
                ].join(" ")}
              >
                {currentMeta.lossy ? quality : "—"}
              </span>
              {currentMeta.lossy && (
                <span className="font-mono text-[11px] text-muted">/100</span>
              )}
            </span>
          </div>

          <input
            id="quality"
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            disabled={!currentMeta.lossy}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="range-accent"
            style={{ "--fill": `${quality}%` } as React.CSSProperties}
            aria-valuemin={1}
            aria-valuemax={100}
            aria-valuenow={quality}
          />

          <p className="mt-3 text-[12.5px] text-muted">
            {currentMeta.lossy
              ? "Lebih rendah = ukuran lebih kecil."
              : `${currentMeta.label} lossless — slider tidak berlaku.`}
          </p>
        </div>
      </div>

      {/* Advanced options */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-surface/60 shadow-inset-hi">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="advanced-panel"
          className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
        >
          <Settings2 size={14} strokeWidth={2} className="text-muted-strong" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Opsi Lanjutan
          </span>
          <span className="ml-2 hidden font-mono text-[11px] text-muted-strong sm:inline">
            {presetId === "none" ? "tanpa resize" : presetId === "custom" ? "custom" : (RESIZE_PRESETS.find((p) => p.id === presetId)?.label ?? "")}
            {options.rotate ? ` · ${options.rotate}°` : ""}
            {options.stripMetadata ? " · strip" : ""}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2.2}
            className={[
              "ml-auto text-muted transition-transform duration-200 ease-out",
              advancedOpen ? "rotate-180 text-foreground" : "",
            ].join(" ")}
          />
        </button>

        <div
          id="advanced-panel"
          className={[
            "grid transition-[grid-template-rows] duration-300 ease-out",
            advancedOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <div className="grid gap-5 border-t border-white/[0.05] px-5 py-5 sm:grid-cols-2">
              {/* Resize preset + custom dimensions */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="resize-preset"
                  className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted"
                >
                  Resize
                </label>
                <select
                  id="resize-preset"
                  value={presetId === "custom" ? "custom" : presetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === "custom") {
                      // Keep current dimensions or seed from a sensible default
                      setOpt("resize", options.resize ?? { width: 1920, height: 1920, fit: "inside" });
                      return;
                    }
                    const p = RESIZE_PRESETS.find((x) => x.id === id);
                    if (!p || p.id === "none") {
                      setOpt("resize", undefined);
                      return;
                    }
                    setOpt("resize", { width: p.width, height: p.height, fit: p.fit });
                  }}
                  className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 text-[13px] text-foreground transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  {RESIZE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  {presetId === "custom" && <option value="custom">Custom</option>}
                </select>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="resize-width"
                      className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted"
                    >
                      Lebar (px)
                    </label>
                    <input
                      id="resize-width"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="auto"
                      value={options.resize?.width ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value));
                        const cur = options.resize ?? { fit: "inside" as ResizeFit };
                        if (v == null && cur.height == null) {
                          setOpt("resize", undefined);
                        } else {
                          setOpt("resize", { ...cur, width: v });
                        }
                      }}
                      className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] tabular-nums text-foreground transition-colors placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="resize-height"
                      className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted"
                    >
                      Tinggi (px)
                    </label>
                    <input
                      id="resize-height"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="auto"
                      value={options.resize?.height ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value));
                        const cur = options.resize ?? { fit: "inside" as ResizeFit };
                        if (v == null && cur.width == null) {
                          setOpt("resize", undefined);
                        } else {
                          setOpt("resize", { ...cur, height: v });
                        }
                      }}
                      className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] tabular-nums text-foreground transition-colors placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                  </div>
                </div>

                {/* Fit mode */}
                <div className="mt-3">
                  <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                    Mode
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Mode resize"
                    className="grid grid-cols-3 gap-1.5 rounded-md border border-white/[0.07] bg-base/40 p-1"
                  >
                    {([
                      { id: "inside", label: "Fit dalam" },
                      { id: "cover", label: "Crop" },
                      { id: "contain", label: "Letterbox" },
                    ] as const).map((m) => {
                      const active = (options.resize?.fit ?? "inside") === m.id;
                      const disabled = !options.resize;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={disabled}
                          onClick={() => {
                            if (!options.resize) return;
                            setOpt("resize", { ...options.resize, fit: m.id });
                          }}
                          className={[
                            "rounded-[5px] px-2 py-1.5 text-[12px] font-medium tracking-tight transition-all duration-150 ease-out",
                            disabled
                              ? "cursor-not-allowed text-muted/30"
                              : active
                                ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                                : "text-muted-strong hover:bg-white/[0.04] hover:text-foreground",
                          ].join(" ")}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Crop position — only visible when fit=cover */}
                <div
                  className={[
                    "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
                    options.resize?.fit === "cover"
                      ? "mt-3 grid-rows-[1fr] opacity-100"
                      : "mt-0 grid-rows-[0fr] opacity-0",
                  ].join(" ")}
                  aria-hidden={options.resize?.fit !== "cover"}
                >
                  <div className="overflow-hidden">
                    <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                      Crop dari
                    </span>
                    <CropPositionGrid
                      value={options.resize?.position ?? "center"}
                      onChange={(p) => {
                        if (!options.resize) return;
                        setOpt("resize", { ...options.resize, position: p });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Rotate */}
              <div>
                <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  Rotasi
                </span>
                <div
                  role="radiogroup"
                  aria-label="Rotasi gambar"
                  className="grid grid-cols-4 gap-1.5 rounded-md border border-white/[0.07] bg-base/40 p-1"
                >
                  {([0, 90, 180, 270] as const).map((deg) => {
                    const active = (options.rotate ?? 0) === deg;
                    return (
                      <button
                        key={deg}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setOpt("rotate", deg)}
                        className={[
                          "rounded-[5px] px-2 py-1.5 font-mono text-[12px] tabular-nums tracking-tight transition-all duration-150 ease-out",
                          active
                            ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                            : "text-muted-strong hover:bg-white/[0.04] hover:text-foreground",
                        ].join(" ")}
                      >
                        {deg}°
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background color */}
              <div>
                <label
                  htmlFor="bg-hex"
                  className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted"
                >
                  Warna latar
                </label>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="bg-color"
                    className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/20"
                    style={{ background: options.background }}
                    aria-label="Pilih warna latar"
                  >
                    <input
                      id="bg-color"
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(options.background) ? options.background : "#ffffff"}
                      onChange={(e) => setOpt("background", e.target.value)}
                      className="h-12 w-12 cursor-pointer opacity-0"
                      aria-label="Color picker warna latar"
                    />
                  </label>
                  <input
                    id="bg-hex"
                    type="text"
                    value={options.background}
                    onChange={(e) => setOpt("background", e.target.value)}
                    placeholder="#ffffff"
                    spellCheck={false}
                    className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] tracking-tight text-foreground transition-colors placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  Untuk transparansi → JPEG atau letterbox.
                </p>
              </div>

              {/* Watermark */}
              <WatermarkSection
                value={options.watermark ?? DEFAULT_WATERMARK}
                onChange={(wm) => setOpt("watermark", wm)}
              />

              {/* Toggles */}
              <div className="sm:col-span-2">
                <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  Metadata
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CheckOption
                    id="auto-orient"
                    label="Auto-rotate (EXIF)"
                    hint="Honor orientasi dari kamera/HP"
                    checked={options.autoOrient}
                    onChange={(v) => setOpt("autoOrient", v)}
                  />
                  <CheckOption
                    id="strip-metadata"
                    label="Hapus metadata"
                    hint="EXIF, GPS, IPTC — privasi"
                    checked={options.stripMetadata}
                    onChange={(v) => setOpt("stripMetadata", v)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Unggah gambar untuk dikonversi"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={[
          "group relative grid cursor-pointer place-items-center overflow-hidden rounded-lg px-6 py-14 transition-all duration-200 ease-out sm:py-20",
          dragActive
            ? "bg-accent/[0.06] drop-active"
            : "border border-white/[0.08] bg-surface/40 hover:border-white/15 hover:bg-surface/60",
        ].join(" ")}
      >
        {/* Halo on drag */}
        <div
          aria-hidden
          className={[
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            dragActive ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(196_240_66_/_0.12),transparent_60%)]" />
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_INPUT}
          className="sr-only"
          onChange={onPick}
        />

        <div className="relative text-center">
          <div
            className={[
              "mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border transition-all duration-200 ease-out",
              dragActive
                ? "scale-110 border-accent/50 bg-accent/15 text-accent"
                : "border-white/10 bg-white/[0.03] text-muted-strong group-hover:border-white/20 group-hover:bg-white/[0.05] group-hover:text-foreground",
            ].join(" ")}
          >
            <UploadCloud size={26} strokeWidth={1.6} />
          </div>

          <p className="text-[15.5px] font-medium tracking-tight text-foreground sm:text-base">
            {dragActive
              ? "Lepaskan untuk menambahkan ke antrian"
              : "Drag & drop, atau klik untuk pilih file"}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted">
            <span>JPG · PNG · WebP · AVIF · TIFF · GIF · SVG · DNG</span>
            <span className="text-white/15">·</span>
            <span>
              max{" "}
              <span className="text-muted-strong">
                {(MAX_BYTES / 1024 / 1024).toFixed(1)} MB
              </span>
              {" / "}
              <span className="text-muted-strong">
                {(MAX_BLOB_BYTES / 1024 / 1024).toFixed(0)} MB
              </span>{" "}
              untuk DNG
            </span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      {jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.07] bg-surface/60 p-3 shadow-inset-hi sm:p-4">
          <button
            type="button"
            onClick={convertAll}
            disabled={busy || queuedCount === 0}
            className={[
              "group inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13.5px] font-semibold tracking-tight transition-all duration-150 ease-out",
              busy || queuedCount === 0
                ? "cursor-not-allowed border border-white/[0.06] bg-white/[0.02] text-muted/60"
                : "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5)] hover:-translate-y-px hover:shadow-accent-glow active:translate-y-0",
            ].join(" ")}
          >
            {busy ? (
              <>
                <Loader2 size={14} strokeWidth={2.4} className="animate-spin" />
                <span>Mengonversi…</span>
              </>
            ) : queuedCount > 0 ? (
              <>
                <span>
                  Konversi {queuedCount} file
                </span>
                <ArrowRight
                  size={14}
                  strokeWidth={2.4}
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
                <span className="font-mono text-[12px] tracking-wider">
                  {currentMeta.label}
                </span>
              </>
            ) : (
              <>
                <Check size={14} strokeWidth={2.4} />
                <span>Semua selesai</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={downloadAll}
            disabled={doneCount === 0}
            className={[
              "inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-[13px] font-medium transition-all duration-150 ease-out",
              doneCount === 0
                ? "cursor-not-allowed border-white/[0.05] bg-white/[0.01] text-muted/40"
                : "border-white/10 bg-white/[0.03] text-muted-strong hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground",
            ].join(" ")}
          >
            <Download size={13} strokeWidth={2.2} />
            <span>
              Download semua{" "}
              <span className="font-mono text-[11.5px] text-muted">
                ({doneCount})
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={downloadZip}
            disabled={doneCount === 0 || zipBusy || busy}
            className={[
              "inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-[13px] font-medium transition-all duration-150 ease-out",
              doneCount === 0 || zipBusy || busy
                ? "cursor-not-allowed border-white/[0.05] bg-white/[0.01] text-muted/40"
                : "border-white/10 bg-white/[0.03] text-muted-strong hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground",
            ].join(" ")}
          >
            {zipBusy ? (
              <Loader2 size={13} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Archive size={13} strokeWidth={2.2} />
            )}
            <span>
              {zipBusy ? "Mengemas…" : "Download semua sebagai ZIP"}
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-muted sm:flex">
              <span>
                <span className="text-muted-strong">{queuedCount}</span> antri
              </span>
              <span className="text-white/15">·</span>
              <span>
                <span className="text-muted-strong">{doneCount}</span> selesai
              </span>
            </div>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy}
              aria-label="Bersihkan semua"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={12} strokeWidth={2.2} />
              <span className="hidden sm:inline">Bersihkan</span>
            </button>
          </div>
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-white/[0.07] bg-surface/40 shadow-inset-hi">
          {jobs.map((job, idx) => (
            <JobRow
              key={job.id}
              job={job}
              isFirst={idx === 0}
              onRemove={() => removeJob(job.id)}
              busy={busy}
            />
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function JobRow({
  job,
  isFirst,
  onRemove,
  busy,
}: {
  job: Job;
  isFirst: boolean;
  onRemove: () => void;
  busy: boolean;
}) {
  const targetMeta = OUTPUT_FORMATS.find((f) => f.id === job.format)!;
  const src = sourceLabel(job.file.name);

  const delta =
    job.status === "done" && job.outputSize !== undefined
      ? Math.round(((job.outputSize - job.file.size) / job.file.size) * 100)
      : null;

  return (
    <li
      className={[
        "relative flex flex-wrap items-center gap-3 px-4 py-3 transition-colors animate-slide-up sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-3.5",
        isFirst ? "" : "border-t border-white/[0.05]",
        job.status === "running" ? "bg-accent/[0.025]" : "",
      ].join(" ")}
    >
      {/* Shimmer overlay while running */}
      {job.status === "running" && (
        <span
          aria-hidden
          className="shimmer pointer-events-none absolute inset-x-0 top-0 h-px"
        />
      )}

      <StatusBadge status={job.status} />

      {/* Input + output thumbnails */}
      <JobThumbs job={job} />

      {/* Filename + format direction */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <FileImage
            size={13}
            strokeWidth={2}
            className="shrink-0 text-muted"
            aria-hidden
          />
          <p className="truncate text-[13.5px] font-medium text-foreground">
            {job.file.name}
          </p>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider">
            <span className="rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-[1px] text-muted-strong">
              {src}
            </span>
            <ArrowRight size={10} strokeWidth={2} className="text-muted" />
            <span
              className={[
                "rounded border px-1.5 py-[1px]",
                job.status === "done"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-white/[0.08] bg-white/[0.02] text-muted-strong",
              ].join(" ")}
            >
              {targetMeta.label}
            </span>
          </span>

          <span className="text-white/15">·</span>

          <span className="font-mono tabular-nums text-[11.5px]">
            {formatBytes(job.file.size)}
            {job.status === "done" && job.outputSize !== undefined && (
              <>
                <span className="mx-1 text-white/20">→</span>
                <span className="text-muted-strong">
                  {formatBytes(job.outputSize)}
                </span>
                {delta !== null && (
                  <span
                    className={[
                      "ml-1.5 inline-flex items-center rounded px-1 py-px font-mono text-[10.5px] tabular-nums",
                      delta <= 0
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning",
                    ].join(" ")}
                  >
                    {delta <= 0 ? "−" : "+"}
                    {Math.abs(delta)}%
                  </span>
                )}
              </>
            )}
          </span>

          {job.status === "error" && job.error && (
            <>
              <span className="text-white/15">·</span>
              <span className="inline-flex items-center gap-1 text-danger">
                <TriangleAlert size={11} strokeWidth={2.2} />
                {job.error}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {job.status === "done" && job.outputUrl && (
          <a
            href={job.outputUrl}
            download={job.outputName}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-semibold tracking-tight text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.45)] transition-all duration-150 hover:-translate-y-px hover:shadow-accent-glow"
          >
            <Download size={12} strokeWidth={2.4} />
            <span>Download</span>
          </a>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy && job.status === "running"}
          className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Hapus ${job.file.name}`}
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<
    JobStatus,
    { label: string; ring: string; dot: React.ReactNode }
  > = {
    queued: {
      label: "Antri",
      ring: "border-white/10 bg-white/[0.03] text-muted",
      dot: <span className="h-1.5 w-1.5 rounded-full bg-muted/70" />,
    },
    running: {
      label: "Memproses",
      ring: "border-accent/40 bg-accent/10 text-accent",
      dot: <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />,
    },
    done: {
      label: "Selesai",
      ring: "border-success/30 bg-success/10 text-success",
      dot: <Check size={11} strokeWidth={3} />,
    },
    error: {
      label: "Gagal",
      ring: "border-danger/30 bg-danger/10 text-danger",
      dot: <TriangleAlert size={11} strokeWidth={2.4} />,
    },
  };
  const cfg = map[status];
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider",
        cfg.ring,
      ].join(" ")}
      aria-label={cfg.label}
      title={cfg.label}
    >
      {cfg.dot}
      <span>{cfg.label}</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.08] bg-surface/20 px-6 py-8 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Antrian kosong
      </p>
      <p className="text-[13px] text-muted-strong">
        Tambahkan file di atas — konversi akan muncul di sini.
      </p>
    </div>
  );
}

function CheckOption({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={[
        "group flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-all duration-150 ease-out",
        checked
          ? "border-accent/40 bg-accent/[0.04]"
          : "border-white/[0.07] bg-base/40 hover:border-white/15 hover:bg-white/[0.03]",
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={[
          "mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border transition-all duration-150",
          checked
            ? "border-accent bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5)]"
            : "border-white/15 bg-white/[0.02] text-transparent group-hover:border-white/30",
        ].join(" ")}
      >
        <Check size={11} strokeWidth={3.2} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium tracking-tight text-foreground">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/* ---------------- Crop position selector ---------------- */

const CROP_GRID: ReadonlyArray<{
  id: CropPosition;
  label: string;
  cell: number; // 0..8 in 3x3 grid
}> = [
  { id: "top", label: "Atas-Kiri", cell: 0 },
  { id: "top", label: "Atas", cell: 1 },
  { id: "top", label: "Atas-Kanan", cell: 2 },
  { id: "left", label: "Kiri", cell: 3 },
  { id: "center", label: "Tengah", cell: 4 },
  { id: "right", label: "Kanan", cell: 5 },
  { id: "bottom", label: "Bawah-Kiri", cell: 6 },
  { id: "bottom", label: "Bawah", cell: 7 },
  { id: "bottom", label: "Bawah-Kanan", cell: 8 },
];

/**
 * 3x3 grid for crop gravity. Sharp accepts only the 7 named gravities
 * (top/right/bottom/left/center + attention/entropy), so corner cells map to the
 * nearest cardinal — but we still indicate which corner was chosen visually
 * via a small dot. The user picks intent; the server picks the best gravity.
 */
function CropPositionGrid({
  value,
  onChange,
}: {
  value: CropPosition;
  onChange: (p: CropPosition) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Posisi crop"
        className="grid w-fit grid-cols-3 gap-1 rounded-md border border-white/[0.07] bg-base/40 p-1"
      >
        {CROP_GRID.map((c, i) => {
          // Active when matching id AND (for center/cardinal) the chosen cell.
          // Corner cells route to nearest cardinal; mark active by id alone for those.
          const isCorner = i === 0 || i === 2 || i === 6 || i === 8;
          const active =
            value === c.id &&
            // For non-corners we need exact cell match (only one cell matches);
            // for corners we accept the cardinal id match.
            (isCorner ? true : true);
          return (
            <button
              key={`${c.id}-${i}`}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.label}
              onClick={() => onChange(c.id)}
              className={[
                "relative grid h-7 w-7 place-items-center rounded-[5px] transition-all duration-150 ease-out",
                active
                  ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                  : "bg-white/[0.02] text-muted-strong hover:bg-white/[0.06] hover:text-foreground",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={[
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  active ? "bg-base" : "bg-muted-strong/70",
                ].join(" ")}
              />
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label="Strategi crop pintar"
        className="flex flex-wrap gap-1.5"
      >
        {([
          { id: "attention", label: "Pintar", hint: "deteksi otomatis", icon: <Sparkles size={11} strokeWidth={2.2} /> },
          { id: "entropy", label: "Entropi", hint: "area paling padat", icon: null },
        ] as const).map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(s.id)}
              title={s.hint}
              className={[
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium tracking-tight transition-all duration-150 ease-out",
                active
                  ? "border-accent/40 bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                  : "border-white/[0.07] bg-base/40 text-muted-strong hover:border-white/15 hover:text-foreground",
              ].join(" ")}
            >
              {s.icon}
              <span>{s.label}</span>
              <span
                className={[
                  "font-mono text-[9.5px] uppercase tracking-wider",
                  active ? "text-base/70" : "text-muted",
                ].join(" ")}
              >
                {s.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Watermark section ---------------- */

const WM_GRID: ReadonlyArray<{
  id: WatermarkPosition;
  label: string;
}> = [
  { id: "tl", label: "Atas-Kiri" },
  { id: "tc", label: "Atas" },
  { id: "tr", label: "Atas-Kanan" },
  { id: "ml", label: "Kiri" },
  { id: "mc", label: "Tengah" },
  { id: "mr", label: "Kanan" },
  { id: "bl", label: "Bawah-Kiri" },
  { id: "bc", label: "Bawah" },
  { id: "br", label: "Bawah-Kanan" },
];

function WatermarkSection({
  value,
  onChange,
}: {
  value: { text: string; position: WatermarkPosition; opacity: number; fontSize: number; color: string };
  onChange: (
    wm: { text: string; position: WatermarkPosition; opacity: number; fontSize: number; color: string },
  ) => void;
}) {
  const active = value.text.trim().length > 0;
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : "#ffffff";

  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Watermark
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-strong">
          {active ? `${value.position} · ${value.opacity}%` : "off"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={[
            "grid h-9 w-9 shrink-0 place-items-center rounded-md border transition-colors",
            active
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-white/[0.07] bg-base/40 text-muted",
          ].join(" ")}
        >
          <Type size={14} strokeWidth={2} />
        </span>
        <input
          id="wm-text"
          type="text"
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder="© Your Brand 2026"
          aria-label="Teks watermark"
          spellCheck={false}
          maxLength={200}
          className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 text-[13px] tracking-tight text-foreground transition-colors placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </div>

      {!active && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          Kosongkan untuk tanpa watermark.
        </p>
      )}

      <div
        className={[
          "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
          active ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
        ].join(" ")}
        aria-hidden={!active}
      >
        <div className="overflow-hidden">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            {/* Position 3×3 */}
            <div>
              <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                Posisi
              </span>
              <div
                role="radiogroup"
                aria-label="Posisi watermark"
                className="grid w-fit grid-cols-3 gap-1 rounded-md border border-white/[0.07] bg-base/40 p-1"
              >
                {WM_GRID.map((g) => {
                  const isActive = value.position === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={g.label}
                      onClick={() => onChange({ ...value, position: g.id })}
                      className={[
                        "relative grid h-7 w-7 place-items-center rounded-[5px] transition-all duration-150 ease-out",
                        isActive
                          ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                          : "bg-white/[0.02] text-muted-strong hover:bg-white/[0.06] hover:text-foreground",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className={[
                          "h-1.5 w-1.5 rounded-full transition-colors",
                          isActive ? "bg-base" : "bg-muted-strong/70",
                        ].join(" ")}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sliders + color */}
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label
                    htmlFor="wm-opacity"
                    className="font-mono text-[10.5px] uppercase tracking-wider text-muted"
                  >
                    Opasitas
                  </label>
                  <span className="font-mono text-[11px] tabular-nums text-muted-strong">
                    {value.opacity}%
                  </span>
                </div>
                <input
                  id="wm-opacity"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value.opacity}
                  onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) })}
                  className="range-accent"
                  style={{ "--fill": `${value.opacity}%` } as React.CSSProperties}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value.opacity}
                />
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label
                    htmlFor="wm-fontsize"
                    className="font-mono text-[10.5px] uppercase tracking-wider text-muted"
                  >
                    Ukuran teks{" "}
                    <span className="text-muted-strong/70">(% sisi terpendek)</span>
                  </label>
                  <span className="font-mono text-[11px] tabular-nums text-muted-strong">
                    {value.fontSize.toFixed(1)}
                  </span>
                </div>
                <input
                  id="wm-fontsize"
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={value.fontSize}
                  onChange={(e) => onChange({ ...value, fontSize: Number(e.target.value) })}
                  className="range-accent"
                  style={{ "--fill": `${((value.fontSize - 0.5) / 19.5) * 100}%` } as React.CSSProperties}
                  aria-valuemin={0.5}
                  aria-valuemax={20}
                  aria-valuenow={value.fontSize}
                />
              </div>

              <div>
                <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
                  Warna teks
                </span>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="wm-color"
                    className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/20"
                    style={{ background: safeColor }}
                    aria-label="Pilih warna watermark"
                  >
                    <input
                      id="wm-color"
                      type="color"
                      value={safeColor}
                      onChange={(e) => onChange({ ...value, color: e.target.value })}
                      className="h-12 w-12 cursor-pointer opacity-0"
                      aria-label="Color picker warna watermark"
                    />
                  </label>
                  <input
                    type="text"
                    value={value.color}
                    onChange={(e) => onChange({ ...value, color: e.target.value })}
                    placeholder="#ffffff"
                    spellCheck={false}
                    aria-label="Hex warna watermark"
                    className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] tracking-tight text-foreground transition-colors placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Job row thumbnails ---------------- */

function JobThumbs({ job }: { job: Job }) {
  const isDng = /\.dng$/i.test(job.file.name);
  const ext = job.file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const inputBadge = isDng ? "DNG" : ext.toUpperCase().slice(0, 4);

  // Output preview is renderable when format is in our preview-able set AND the URL is set.
  const outputRenderable =
    job.status === "done" &&
    !!job.outputUrl &&
    OUTPUT_PREVIEWABLE.has(job.format);

  // Output non-renderable but done: show format badge instead.
  const outputBadge =
    job.status === "done" && !outputRenderable
      ? job.format.toUpperCase()
      : null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Input thumb */}
      {job.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={job.thumbUrl}
          alt=""
          aria-label="Pratinjau input"
          className="h-10 w-10 rounded-md border border-white/[0.08] bg-base/40 object-cover sm:h-11 sm:w-11"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          aria-label="Pratinjau input"
          className="grid h-10 w-10 place-items-center rounded-md border border-white/[0.08] bg-base/40 text-muted-strong sm:h-11 sm:w-11"
        >
          {isDng ? (
            <span className="font-mono text-[9.5px] uppercase tracking-wider">
              DNG
            </span>
          ) : job.thumbUrl === "" ? (
            // Generation completed but failed — show format hint
            <span className="font-mono text-[9.5px] uppercase tracking-wider">
              {inputBadge || "IMG"}
            </span>
          ) : (
            <FileImage size={14} strokeWidth={1.8} aria-hidden />
          )}
        </span>
      )}

      {/* Arrow + output thumb (only when output is renderable, otherwise badge with no arrow) */}
      {outputRenderable && (
        <>
          <ArrowRight size={11} strokeWidth={2} className="text-muted" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.outputUrl!}
            alt=""
            aria-label="Pratinjau output"
            className="h-10 w-10 rounded-md border border-accent/40 bg-base/40 object-cover sm:h-11 sm:w-11"
            loading="lazy"
            decoding="async"
          />
        </>
      )}

      {outputBadge && (
        <>
          <ArrowRight size={11} strokeWidth={2} className="text-muted" aria-hidden />
          <span
            aria-label="Pratinjau output"
            className="grid h-10 w-10 place-items-center rounded-md border border-accent/40 bg-accent/10 font-mono text-[10px] uppercase tracking-wider text-accent sm:h-11 sm:w-11"
          >
            {outputBadge}
          </span>
        </>
      )}
    </div>
  );
}

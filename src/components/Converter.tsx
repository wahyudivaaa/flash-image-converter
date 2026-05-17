"use client";

import {
  ACCEPT_INPUT,
  MAX_BLOB_BYTES,
  MAX_BYTES,
  OUTPUT_FORMATS,
  isDngFile,
  type OutputFormat,
} from "@/lib/formats";
import { upload } from "@vercel/blob/client";
import {
  ArrowRight,
  Check,
  Download,
  FileImage,
  Loader2,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

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
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
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
  const res = await fetch("/api/convert-dng", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: blob.url,
      format,
      quality,
      originalName: file.name,
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
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMeta = useMemo(
    () => OUTPUT_FORMATS.find((f) => f.id === format)!,
    [format],
  );

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
        const result = await runDngJob(job.file, job.format, job.quality);
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

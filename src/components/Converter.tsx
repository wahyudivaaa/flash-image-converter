"use client";

import {
  ACCEPT_INPUT,
  MAX_BYTES,
  OUTPUT_FORMATS,
  type OutputFormat,
} from "@/lib/formats";
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
      if (job?.outputUrl) URL.revokeObjectURL(job.outputUrl);
      return prev.filter((j) => j.id !== id);
    });
  };

  const clearAll = () => {
    jobs.forEach((j) => j.outputUrl && URL.revokeObjectURL(j.outputUrl));
    setJobs([]);
  };

  const runJob = async (job: Job): Promise<Job> => {
    if (job.file.size > MAX_BYTES) {
      return {
        ...job,
        status: "error",
        error: `Melebihi batas ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB`,
      };
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
      {/* Controls */}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-zinc-400">
            Format tujuan
          </label>
          <div className="flex flex-wrap gap-2">
            {OUTPUT_FORMATS.map((f) => {
              const active = format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-zinc-100 text-zinc-900"
                      : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">{currentMeta.hint}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:min-w-[260px]">
          <label className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-widest text-zinc-400">
            <span>Kualitas</span>
            <span className="text-zinc-300">{quality}</span>
          </label>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={quality}
            disabled={!currentMeta.lossy}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full accent-zinc-100 disabled:opacity-30"
          />
          <p className="mt-3 text-xs text-zinc-500">
            {currentMeta.lossy
              ? "Lebih rendah = ukuran lebih kecil."
              : "Format lossless — slider tidak berlaku."}
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={[
          "group relative grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors",
          dragActive
            ? "border-zinc-100 bg-white/[0.04]"
            : "border-white/10 bg-white/[0.02] hover:border-white/20",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_INPUT}
          className="hidden"
          onChange={onPick}
        />
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/5 text-zinc-300">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 16V4" />
              <path d="m6 10 6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
          </div>
          <p className="text-base font-medium">
            Drag & drop file di sini, atau klik untuk pilih
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            JPG, PNG, WebP, AVIF, TIFF, GIF, SVG · max{" "}
            {(MAX_BYTES / 1024 / 1024).toFixed(1)} MB per file
          </p>
        </div>
      </div>

      {/* Action bar */}
      {jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <button
            type="button"
            onClick={convertAll}
            disabled={busy || queuedCount === 0}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "Mengonversi..."
              : queuedCount > 0
                ? `Konversi ${queuedCount} file → ${currentMeta.label}`
                : "Semua selesai"}
          </button>
          <button
            type="button"
            onClick={downloadAll}
            disabled={doneCount === 0}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download semua ({doneCount})
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={busy}
            className="ml-auto rounded-lg border border-transparent px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
          >
            Bersihkan
          </button>
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap"
            >
              <StatusDot status={job.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {job.file.name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {formatBytes(job.file.size)}
                  {job.status === "done" && job.outputSize !== undefined && (
                    <>
                      {" "}
                      → {formatBytes(job.outputSize)} ·{" "}
                      <span
                        className={
                          job.outputSize <= job.file.size
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }
                      >
                        {job.outputSize <= job.file.size ? "−" : "+"}
                        {Math.abs(
                          Math.round(
                            ((job.outputSize - job.file.size) / job.file.size) *
                              100,
                          ),
                        )}
                        %
                      </span>
                    </>
                  )}
                  {job.status === "error" && job.error && (
                    <> · <span className="text-rose-400">{job.error}</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {job.status === "done" && job.outputUrl && (
                  <a
                    href={job.outputUrl}
                    download={job.outputName}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08]"
                  >
                    Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => removeJob(job.id)}
                  disabled={busy && job.status === "running"}
                  className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-30"
                  aria-label={`Hapus ${job.file.name}`}
                >
                  &times;
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { color: string; label: string }> = {
    queued: { color: "bg-zinc-500", label: "Antri" },
    running: { color: "bg-amber-400 animate-pulse", label: "Memproses" },
    done: { color: "bg-emerald-400", label: "Selesai" },
    error: { color: "bg-rose-500", label: "Gagal" },
  };
  const cfg = map[status];
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-zinc-400"
      title={cfg.label}
    >
      <span className={`h-2 w-2 rounded-full ${cfg.color}`} aria-hidden />
      <span className="hidden sm:inline">{cfg.label}</span>
    </span>
  );
}

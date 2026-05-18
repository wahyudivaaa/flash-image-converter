"use client";

import {
  DEFAULT_OPTIONS,
  MAX_BLOB_BYTES,
  MAX_BYTES,
  OUTPUT_FORMATS,
  isRawFile,
  type ConvertOptions,
  type OutputFormat,
} from "@/lib/formats";
import { upload } from "@vercel/blob/client";
import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionBar } from "./ActionBar";
import {
  generateThumb,
  uid,
  type Job,
} from "./converter-utils";
import { DropZone } from "./DropZone";
import { FormatPicker } from "./FormatPicker";
import { JobList } from "./JobList";
import { OptionsPanel } from "./OptionsPanel";
import { QualityCard } from "./QualityCard";

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
  // 1. Upload RAW directly to Vercel Blob (bypasses 4.5 MB serverless cap)
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
  const [zipBusy, setZipBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  // Generate input thumbnails for any new jobs that don't yet have one.
  useEffect(() => {
    const pending = jobs.filter((j) => j.thumbUrl === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const j of pending) {
        const url = await generateThumb(j.file);
        if (cancelled) return;
        setJobs((prev) =>
          prev.map((x) => (x.id === j.id ? { ...x, thumbUrl: url ?? "" } : x)),
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

  const removeJob = (id: string) => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      if (job?.outputUrl && job.outputUrl.startsWith("blob:"))
        URL.revokeObjectURL(job.outputUrl);
      return prev.filter((j) => j.id !== id);
    });
  };

  const clearAll = () => {
    jobs.forEach((j) => {
      if (j.outputUrl && j.outputUrl.startsWith("blob:"))
        URL.revokeObjectURL(j.outputUrl);
    });
    setJobs([]);
  };

  const runJob = async (job: Job): Promise<Job> => {
    const isDng = isRawFile(job.file);
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
        const msg = err instanceof Error ? err.message : "RAW conversion failed";
        return { ...job, status: "error", error: msg };
      }
    }

    const fd = new FormData();
    fd.append("file", job.file);
    fd.append("format", job.format);
    fd.append("quality", String(job.quality));
    if (options.resize?.width != null)
      fd.append("resizeWidth", String(options.resize.width));
    if (options.resize?.height != null)
      fd.append("resizeHeight", String(options.resize.height));
    if (options.resize?.fit) fd.append("resizeFit", options.resize.fit);
    if (options.resize?.fit === "cover" && options.resize?.position) {
      fd.append("cropPosition", options.resize.position);
    }
    if (options.rotate != null) fd.append("rotate", String(options.rotate));
    fd.append("autoOrient", options.autoOrient ? "true" : "false");
    fd.append("stripMetadata", options.stripMetadata ? "true" : "false");
    if (options.background) fd.append("background", options.background);

    // Watermark — only send when text is non-empty
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
      for (const j of done) {
        try {
          const res = await fetch(j.outputUrl!);
          if (!res.ok) continue;
          const blob = await res.blob();
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
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setZipBusy(false);
    }
  };

  const doneCount = useMemo(
    () => jobs.filter((j) => j.status === "done").length,
    [jobs],
  );
  const queuedCount = useMemo(
    () =>
      jobs.filter((j) => j.status === "queued" || j.status === "error").length,
    [jobs],
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Format + Quality — paired controls, equal weight */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.4fr_1fr]">
        <FormatPicker value={format} onChange={setFormat} />
        <QualityCard format={format} value={quality} onChange={setQuality} />
      </div>

      {/* Advanced — collapsed by default, grouped by intent */}
      <OptionsPanel options={options} setOptions={setOptions} />

      {/* Drop zone — full when empty, compact strip when files present */}
      <DropZone hasFiles={jobs.length > 0} onFiles={addFiles} />

      {/* Action bar — only when we have something to act on */}
      {jobs.length > 0 && (
        <ActionBar
          format={format}
          busy={busy}
          zipBusy={zipBusy}
          queuedCount={queuedCount}
          doneCount={doneCount}
          totalCount={jobs.length}
          onConvertAll={convertAll}
          onDownloadAll={downloadAll}
          onDownloadZip={downloadZip}
          onClear={clearAll}
        />
      )}

      {/* Job list / empty state */}
      <JobList jobs={jobs} busy={busy} onRemove={removeJob} />
    </div>
  );
}

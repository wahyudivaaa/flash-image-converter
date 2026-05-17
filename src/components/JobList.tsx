"use client";

import { OUTPUT_FORMATS } from "@/lib/formats";
import {
  ArrowRight,
  Check,
  Download,
  FileImage,
  Loader2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  formatBytes,
  OUTPUT_PREVIEWABLE,
  sourceLabel,
  type Job,
  type JobStatus,
} from "./converter-utils";

interface JobListProps {
  jobs: Job[];
  busy: boolean;
  onRemove: (id: string) => void;
}

export function JobList({ jobs, busy, onRemove }: JobListProps) {
  if (jobs.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-white/[0.07] bg-surface/40 elev-1">
      {jobs.map((job, idx) => (
        <JobRow
          key={job.id}
          job={job}
          isFirst={idx === 0}
          onRemove={() => onRemove(job.id)}
          busy={busy}
        />
      ))}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────── */

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
        "row-lift relative flex flex-wrap items-center gap-3 px-4 py-3 animate-slide-up sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-3.5",
        isFirst ? "" : "border-t border-white/[0.05]",
        job.status === "running" ? "bg-accent/[0.025]" : "",
        job.status === "done" ? "bg-success/[0.012]" : "",
      ].join(" ")}
    >
      {job.status === "running" && (
        <span
          aria-hidden
          className="shimmer pointer-events-none absolute inset-x-0 top-0 h-px"
        />
      )}

      <StatusBadge status={job.status} />

      <JobThumbs job={job} />

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
            <ArrowRight
              size={10}
              strokeWidth={2}
              className={[
                "transition-colors duration-base",
                job.status === "done" ? "text-accent" : "text-muted",
              ].join(" ")}
              aria-hidden
            />
            <span
              className={[
                "rounded border px-1.5 py-[1px] transition-colors duration-base",
                job.status === "done"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-white/[0.08] bg-white/[0.02] text-muted-strong",
              ].join(" ")}
            >
              {targetMeta.label}
            </span>
          </span>

          <span aria-hidden className="text-white/15">
            ·
          </span>

          <span className="num font-mono text-[11.5px]">
            {formatBytes(job.file.size)}
            {job.status === "done" && job.outputSize !== undefined && (
              <>
                <span aria-hidden className="mx-1 text-white/20">
                  →
                </span>
                <span className="text-muted-strong">
                  {formatBytes(job.outputSize)}
                </span>
                {delta !== null && (
                  <span
                    className={[
                      "ml-1.5 inline-flex items-center rounded px-1 py-px font-mono text-[10.5px]",
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
              <span aria-hidden className="text-white/15">
                ·
              </span>
              <span className="inline-flex items-center gap-1 text-danger">
                <TriangleAlert size={11} strokeWidth={2.2} />
                {job.error}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {job.status === "done" && job.outputUrl && (
          <a
            href={job.outputUrl}
            download={job.outputName}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-semibold tracking-tight text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.45)] transition-all duration-fast ease-out-quart hover:-translate-y-px hover:shadow-accent-glow"
          >
            <Download size={12} strokeWidth={2.4} />
            <span>Unduh</span>
          </a>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy && job.status === "running"}
          className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-fast hover:bg-white/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors duration-base",
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

function JobThumbs({ job }: { job: Job }) {
  const isDng = /\.dng$/i.test(job.file.name);
  const ext = job.file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const inputBadge = isDng ? "DNG" : ext.toUpperCase().slice(0, 4);

  const outputRenderable =
    job.status === "done" &&
    !!job.outputUrl &&
    OUTPUT_PREVIEWABLE.has(job.format);

  const outputBadge =
    job.status === "done" && !outputRenderable
      ? job.format.toUpperCase()
      : null;

  const showAfter = outputRenderable || !!outputBadge;

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
            <span className="font-mono text-[9.5px] uppercase tracking-wider">
              {inputBadge || "IMG"}
            </span>
          ) : (
            <FileImage size={14} strokeWidth={1.8} aria-hidden />
          )}
        </span>
      )}

      {/* Transformation arrow — animates on done */}
      {showAfter && (
        <span
          aria-hidden
          className="relative grid h-10 w-5 place-items-center sm:h-11"
        >
          <span
            className={[
              "h-px w-full transition-colors duration-base",
              job.status === "done" ? "bg-accent/40" : "bg-white/10",
            ].join(" ")}
          />
          <ArrowRight
            size={11}
            strokeWidth={2.2}
            className={[
              "absolute inset-0 m-auto transition-all duration-base ease-out-quart",
              job.status === "done"
                ? "translate-x-0 text-accent"
                : "-translate-x-px text-muted",
            ].join(" ")}
          />
        </span>
      )}

      {/* Output thumb */}
      {outputRenderable && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={job.outputUrl!}
          alt=""
          aria-label="Pratinjau output"
          className="h-10 w-10 rounded-md border border-accent/40 bg-base/40 object-cover shadow-[0_0_0_3px_rgb(196_240_66_/_0.06)] sm:h-11 sm:w-11"
          loading="lazy"
          decoding="async"
        />
      )}

      {outputBadge && (
        <span
          aria-label="Pratinjau output"
          className="grid h-10 w-10 place-items-center rounded-md border border-accent/40 bg-accent/10 font-mono text-[10px] uppercase tracking-wider text-accent shadow-[0_0_0_3px_rgb(196_240_66_/_0.06)] sm:h-11 sm:w-11"
        >
          {outputBadge}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-dashed border-white/[0.08] bg-surface/20 px-6 py-12 text-center">
      {/* faint grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <div
        aria-hidden
        className="relative grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.025] text-muted-strong"
      >
        <Sparkles size={18} strokeWidth={1.7} />
      </div>

      <div className="relative flex flex-col gap-1">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
          Antrian kosong
        </p>
        <p className="text-[13.5px] tracking-tight text-muted-strong">
          Tarik gambar ke atas — mereka akan muncul di sini, siap dikonversi.
        </p>
      </div>
    </div>
  );
}

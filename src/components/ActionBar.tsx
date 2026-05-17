"use client";

import { OUTPUT_FORMATS, type OutputFormat } from "@/lib/formats";
import {
  Archive,
  ArrowRight,
  Check,
  Download,
  Loader2,
  Trash2,
} from "lucide-react";

interface ActionBarProps {
  format: OutputFormat;
  busy: boolean;
  zipBusy: boolean;
  queuedCount: number;
  doneCount: number;
  totalCount: number;
  onConvertAll: () => void;
  onDownloadAll: () => void;
  onDownloadZip: () => void;
  onClear: () => void;
}

export function ActionBar({
  format,
  busy,
  zipBusy,
  queuedCount,
  doneCount,
  totalCount,
  onConvertAll,
  onDownloadAll,
  onDownloadZip,
  onClear,
}: ActionBarProps) {
  const meta = OUTPUT_FORMATS.find((f) => f.id === format)!;
  const allDone = doneCount > 0 && doneCount === totalCount && queuedCount === 0;
  const ctaDisabled = busy || queuedCount === 0;

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-2 rounded-lg border p-2.5 transition-all duration-base sm:p-3",
        allDone
          ? "border-success/20 bg-success/[0.025] elev-1"
          : busy
            ? "border-accent/20 bg-accent/[0.02] elev-1"
            : "border-white/[0.07] bg-surface/60 elev-1",
      ].join(" ")}
    >
      {/* Primary CTA — confidently sized, lime, with glow */}
      <button
        type="button"
        onClick={onConvertAll}
        disabled={ctaDisabled}
        className={[
          "group inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[13.5px] font-semibold tracking-tight transition-all duration-fast ease-out-quart",
          ctaDisabled
            ? "cursor-not-allowed border border-white/[0.06] bg-white/[0.02] text-muted/50"
            : busy
              ? "cta-primary"
              : "cta-primary motion-safe:animate-cta-pulse",
        ].join(" ")}
        aria-label={
          busy
            ? "Sedang mengonversi"
            : queuedCount > 0
              ? `Konversi ${queuedCount} file ke ${meta.label}`
              : "Semua selesai"
        }
      >
        {busy ? (
          <>
            <Loader2 size={14} strokeWidth={2.6} className="animate-spin" />
            <span>Mengonversi…</span>
          </>
        ) : queuedCount > 0 ? (
          <>
            <span>
              Konversi <span className="num">{queuedCount}</span>{" "}
              {queuedCount === 1 ? "file" : "file"}
            </span>
            <ArrowRight
              size={14}
              strokeWidth={2.6}
              className="transition-transform duration-fast group-hover:translate-x-0.5"
            />
            <span className="rounded bg-base/15 px-1.5 py-px font-mono text-[10.5px] uppercase tracking-wider">
              {meta.label}
            </span>
          </>
        ) : (
          <>
            <Check size={14} strokeWidth={2.6} />
            <span>Semua selesai</span>
          </>
        )}
      </button>

      {/* Secondary — Download ZIP (compact, equal-weight to "all") */}
      <button
        type="button"
        onClick={onDownloadZip}
        disabled={doneCount === 0 || zipBusy || busy}
        className={[
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-medium tracking-tight transition-all duration-fast ease-out-quart",
          doneCount === 0 || zipBusy || busy
            ? "cursor-not-allowed border-white/[0.05] bg-white/[0.01] text-muted/40"
            : "border-accent/30 bg-accent/[0.06] text-accent hover:-translate-y-px hover:border-accent/50 hover:bg-accent/[0.10]",
        ].join(" ")}
        aria-label="Download semua sebagai ZIP"
      >
        {zipBusy ? (
          <Loader2 size={13} strokeWidth={2.4} className="animate-spin" />
        ) : (
          <Archive size={13} strokeWidth={2.2} />
        )}
        <span>{zipBusy ? "Mengemas…" : "ZIP"}</span>
      </button>

      <button
        type="button"
        onClick={onDownloadAll}
        disabled={doneCount === 0}
        className={[
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-medium tracking-tight transition-all duration-fast ease-out-quart",
          doneCount === 0
            ? "cursor-not-allowed border-white/[0.05] bg-white/[0.01] text-muted/40"
            : "border-white/10 bg-white/[0.03] text-muted-strong hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground",
        ].join(" ")}
        aria-label="Download semua file individu"
      >
        <Download size={13} strokeWidth={2.2} />
        <span>
          Semua{" "}
          <span className="num font-mono text-[11.5px] text-muted">
            ({doneCount})
          </span>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-3">
        {/* Inline counter — secondary information, fades during work */}
        <div
          aria-live="polite"
          className={[
            "hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-wider sm:flex",
            busy ? "text-accent" : "text-muted",
          ].join(" ")}
        >
          <Counter label="antri" value={queuedCount} />
          <span aria-hidden className="text-white/15">
            ·
          </span>
          <Counter label="selesai" value={doneCount} accent={allDone} />
        </div>

        {/* Tertiary — destructive, quietest */}
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label="Bersihkan semua"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12px] text-muted transition-colors duration-fast hover:bg-white/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={12} strokeWidth={2.2} />
          <span className="hidden sm:inline">Bersihkan</span>
        </button>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <span>
      <span
        className={[
          "num",
          accent ? "text-success" : "text-muted-strong",
        ].join(" ")}
      >
        {value}
      </span>{" "}
      {label}
    </span>
  );
}

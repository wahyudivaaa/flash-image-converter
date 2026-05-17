"use client";

import { OUTPUT_FORMATS, type OutputFormat } from "@/lib/formats";

interface QualityCardProps {
  format: OutputFormat;
  value: number;
  onChange: (q: number) => void;
}

export function QualityCard({ format, value, onChange }: QualityCardProps) {
  const meta = OUTPUT_FORMATS.find((f) => f.id === format)!;
  const lossy = meta.lossy;

  return (
    <div className="flex h-full flex-col rounded-lg border border-white/[0.07] bg-surface/60 p-5 shadow-inset-hi">
      <div className="mb-4 flex items-baseline justify-between">
        <label
          htmlFor="quality"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted"
        >
          Kualitas
        </label>
        <span
          aria-hidden
          className={[
            "font-mono text-[10.5px] uppercase tracking-wider transition-colors duration-base",
            lossy ? "text-muted-strong" : "text-muted/60",
          ].join(" ")}
        >
          {lossy ? "0–100" : "n/a"}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={[
            "num font-mono text-[44px] font-medium leading-none tracking-tightest transition-colors duration-base",
            lossy ? "text-foreground" : "text-muted/30",
          ].join(" ")}
        >
          {lossy ? value : "—"}
        </span>
        {lossy && (
          <span className="num font-mono text-[13px] text-muted">/100</span>
        )}
      </div>

      <div className="mt-4">
        <input
          id="quality"
          type="range"
          min={1}
          max={100}
          step={1}
          value={value}
          disabled={!lossy}
          onChange={(e) => onChange(Number(e.target.value))}
          className="range-accent"
          style={{ "--fill": `${value}%` } as React.CSSProperties}
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={value}
        />
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        {lossy
          ? "Lebih rendah = ukuran lebih kecil."
          : `${meta.label} lossless — slider tidak berlaku.`}
      </p>
    </div>
  );
}

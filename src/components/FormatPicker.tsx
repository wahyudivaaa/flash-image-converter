"use client";

import { OUTPUT_FORMATS, type OutputFormat } from "@/lib/formats";
import { Check } from "lucide-react";

interface FormatPickerProps {
  value: OutputFormat;
  onChange: (f: OutputFormat) => void;
}

export function FormatPicker({ value, onChange }: FormatPickerProps) {
  const currentMeta = OUTPUT_FORMATS.find((f) => f.id === value)!;

  return (
    <div className="rounded-lg border border-white/[0.07] bg-surface/60 p-5 shadow-inset-hi">
      <div className="mb-4 flex items-baseline justify-between">
        <label className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Format tujuan
        </label>
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-strong">
          {currentMeta.lossy ? "lossy" : "lossless"}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Format keluaran"
        className="grid grid-cols-3 gap-1.5 sm:grid-cols-5"
      >
        {OUTPUT_FORMATS.map((f) => {
          const active = value === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(f.id)}
              className={[
                "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-md px-2.5 py-2 text-left transition-all duration-base ease-out-quart",
                active
                  ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5),0_0_0_1px_rgb(196_240_66_/_0.4),0_0_24px_-8px_rgb(196_240_66_/_0.6)]"
                  : "border border-white/[0.07] bg-white/[0.015] text-muted-strong hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.04] hover:text-foreground",
              ].join(" ")}
            >
              <span className="flex w-full items-center justify-between">
                <span className="text-[13px] font-semibold tracking-tight">
                  {f.label}
                </span>
                <Check
                  size={12}
                  strokeWidth={3}
                  className={[
                    "transition-all duration-fast ease-out-quart",
                    active ? "scale-100 opacity-100" : "scale-75 opacity-0",
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

      <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
        <span
          aria-hidden
          className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent"
        />
        <span>{currentMeta.hint}</span>
      </p>
    </div>
  );
}

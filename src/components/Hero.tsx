"use client";

import { OUTPUT_FORMATS } from "@/lib/formats";
import { ArrowUpRight, Lock, Zap } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Hero — confident headline, auto-cycling format demonstration, ambient mesh.
 *
 * The ribbon cycles through plausible conversion pairs to communicate
 * "convert anything to anything" without saying it. Pauses on hover.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div aria-hidden className="absolute inset-0 grid-bg" />
      <div className="grain absolute inset-0" aria-hidden />
      <div
        aria-hidden
        className="ambient-mesh pointer-events-none absolute inset-x-0 top-0 h-[520px]"
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-14 pb-12 sm:px-6 sm:pt-24 sm:pb-20">
        <StatusChip />

        <h1 className="mt-6 max-w-3xl font-sans text-[44px] font-semibold leading-[0.96] tracking-tightest text-foreground sm:text-[68px] md:text-[82px]">
          Konversi gambar
          <br />
          <span className="inline-flex items-baseline gap-3 sm:gap-5">
            <span className="text-muted-strong">tanpa</span>
            <span className="relative inline-block">
              <span className="relative z-10 text-accent">ribet.</span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-1 h-[10px] -skew-y-1 bg-accent/15 sm:bottom-2 sm:h-3.5"
              />
            </span>
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-strong sm:text-base">
          Konversi langsung di server ke{" "}
          <FormatPill>JPEG</FormatPill>, <FormatPill>PNG</FormatPill>,{" "}
          <FormatPill>WebP</FormatPill>, <FormatPill>AVIF</FormatPill>,{" "}
          <FormatPill>TIFF</FormatPill>, atau <FormatPill>GIF</FormatPill>.
          File kamu tidak pernah meninggalkan server. Tidak ada watermark,
          tidak ada antrian.
        </p>

        <FormatRibbon />

        <StatsStrip />
      </div>
    </section>
  );
}

function StatusChip() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted shadow-inset-hi">
      <span className="relative grid h-1.5 w-1.5 place-items-center">
        <span className="absolute inset-0 rounded-full bg-accent/70 motion-safe:animate-pulse-soft" />
        <span className="absolute inset-0 rounded-full bg-accent" />
      </span>
      <span>online</span>
      <span aria-hidden className="text-white/15">
        ·
      </span>
      <span>vercel edge ready</span>
    </div>
  );
}

function FormatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-white/[0.06] bg-white/[0.02] px-1 py-px font-mono text-[12.5px] tracking-tight text-foreground">
      {children}
    </span>
  );
}

function StatsStrip() {
  const items = [
    { k: "9", v: "format" },
    { k: "DNG", v: "support" },
    { k: "0", v: "watermark" },
    { k: "100%", v: "private" },
  ];
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 sm:mt-10">
      {items.map((it, i) => (
        <div key={it.v} className="flex items-baseline gap-1.5">
          <span className="num font-mono text-[14px] font-medium tracking-tight text-foreground">
            {it.k}
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
            {it.v}
          </span>
          {i < items.length - 1 && (
            <span aria-hidden className="ml-3 text-white/12 sm:ml-4">
              ·
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Auto-cycling demo of "convert from X to Y". Pauses on hover.
 * Communicates the product without claiming it.
 */
function FormatRibbon() {
  const pairs: Array<[string, string]> = [
    ["JPEG", "WebP"],
    ["PNG", "AVIF"],
    ["TIFF", "JPEG"],
    ["DNG", "PNG"],
    ["WebP", "PNG"],
    ["GIF", "WebP"],
  ];
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIdx((v) => (v + 1) % pairs.length), 2400);
    return () => clearInterval(id);
  }, [paused, pairs.length]);

  const [from, to] = pairs[idx];

  // Format chips for the orbit (subset shown on the right)
  const orbit = OUTPUT_FORMATS.slice(0, 5);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      {/* Live "from → to" cell */}
      <div
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-base/40 p-1 shadow-inset-hi"
      >
        <span
          key={`${from}-${idx}`}
          className="num min-w-[3.5rem] rounded-[5px] bg-white/[0.04] px-2.5 py-1 text-center font-mono text-[12px] uppercase tracking-wider text-muted-strong motion-safe:animate-fade-in-up"
        >
          {from}
        </span>
        <ArrowUpRight
          size={13}
          strokeWidth={2.2}
          className="rotate-45 text-accent"
          aria-hidden
        />
        <span
          key={`${to}-${idx}`}
          className="num min-w-[3.5rem] rounded-[5px] bg-accent px-2.5 py-1 text-center font-mono text-[12px] font-semibold uppercase tracking-wider text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.45)] motion-safe:animate-fade-in-up"
        >
          {to}
        </span>
      </div>

      {/* Orbit chips */}
      <div className="flex items-center gap-1">
        {orbit.map((f) => (
          <span
            key={f.id}
            className={[
              "rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider transition-colors duration-base",
              f.label === from || f.label === to
                ? "border-accent/30 text-accent"
                : "text-muted",
            ].join(" ")}
          >
            {f.label}
          </span>
        ))}
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          +{OUTPUT_FORMATS.length - orbit.length}
        </span>
      </div>

      <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">
        <Lock size={10} strokeWidth={2.2} />
        local-pipeline
      </span>
    </div>
  );
}

/* Top bar — sits above hero; sticky */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-base/70 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-[5px] bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5)]"
          >
            <Zap size={13} strokeWidth={2.75} />
          </div>
          <span className="font-mono text-[12.5px] font-medium tracking-tight text-foreground">
            flash<span className="text-muted">/</span>image
          </span>
          <span className="ml-1 hidden rounded-[4px] border border-white/10 bg-white/[0.03] px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider text-muted sm:inline-block">
            v1.0
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <a
            href="https://sharp.pixelplumbing.com/"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-2.5 py-1.5 font-mono text-[11.5px] uppercase tracking-wider text-muted transition-colors duration-fast hover:text-foreground sm:inline-flex sm:items-center sm:gap-1"
          >
            sharp
            <ArrowUpRight size={11} strokeWidth={2} />
          </a>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-muted-strong transition-all duration-fast ease-out-quart hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.05] hover:text-foreground"
          >
            <GithubMark size={13} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

export function GithubMark({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

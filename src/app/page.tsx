import Converter from "@/components/Converter";
import { OUTPUT_FORMATS } from "@/lib/formats";
import { ArrowUpRight, Zap } from "lucide-react";

function GithubMark({ size = 13 }: { size?: number }) {
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

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Top nav — hairline, monospace metadata */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-base/70 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-[5px] bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
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
              className="hidden rounded-md px-2.5 py-1.5 font-mono text-[11.5px] uppercase tracking-wider text-muted transition-colors hover:text-foreground sm:inline-flex sm:items-center sm:gap-1"
            >
              sharp
              <ArrowUpRight size={11} strokeWidth={2} />
            </a>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-muted-strong transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-foreground"
            >
              <GithubMark size={13} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        {/* layered atmosphere: grid + grain + accent halo */}
        <div aria-hidden className="absolute inset-0 grid-bg" />
        <div className="grain absolute inset-0" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_55%_60%_at_50%_0%,rgb(196_240_66_/_0.08),transparent_70%)]"
        />

        <div className="relative mx-auto max-w-5xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24 sm:pb-20">
          {/* status chip */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted shadow-inset-hi">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-pulse-soft rounded-full bg-accent" />
              <span className="absolute inset-0 rounded-full bg-accent/70" />
            </span>
            <span>online</span>
            <span className="text-white/15">·</span>
            <span>vercel edge ready</span>
          </div>

          <h1 className="mt-6 max-w-3xl font-sans text-[40px] font-medium leading-[0.98] tracking-tightest text-foreground sm:text-[64px] md:text-[76px]">
            Konversi gambar
            <br />
            <span className="inline-flex items-baseline gap-3 sm:gap-5">
              <span className="text-muted-strong">tanpa</span>
              <span className="relative inline-block">
                <span className="relative z-10 text-accent">ribet.</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 h-[10px] -skew-y-1 bg-accent/15 sm:bottom-2 sm:h-3"
                />
              </span>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
            Konversi langsung di browser ke{" "}
            <span className="font-mono text-[13.5px] text-muted-strong">JPEG</span>,{" "}
            <span className="font-mono text-[13.5px] text-muted-strong">PNG</span>,{" "}
            <span className="font-mono text-[13.5px] text-muted-strong">WebP</span>,{" "}
            <span className="font-mono text-[13.5px] text-muted-strong">AVIF</span>,{" "}
            <span className="font-mono text-[13.5px] text-muted-strong">TIFF</span>,
            atau{" "}
            <span className="font-mono text-[13.5px] text-muted-strong">GIF</span>.
            File kamu tidak pernah meninggalkan server. Tidak ada watermark,
            tidak ada antrian.
          </p>

          {/* Format ribbon — subtle visual demonstration */}
          <FormatRibbon />
        </div>
      </section>

      {/* App */}
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Converter />
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-[12.5px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2 font-mono text-muted">
            <span className="text-foreground">flash/image</span>
            <span className="text-white/15">·</span>
            <span>v1.0.0</span>
            <span className="text-white/15">·</span>
            <span>node runtime</span>
          </div>
          <div className="flex items-center gap-5 font-mono text-muted">
            <a
              href="https://sharp.pixelplumbing.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              sharp <ArrowUpRight size={11} strokeWidth={2} />
            </a>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              github <ArrowUpRight size={11} strokeWidth={2} />
            </a>
            <span className="hidden text-white/40 sm:inline">MIT</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* Tiny visual: format pills connected by an arrow — communicates "convert between" */
function FormatRibbon() {
  const left = OUTPUT_FORMATS.slice(0, 3);
  const right = OUTPUT_FORMATS.slice(3);

  return (
    <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em]">
      <div className="flex items-center gap-1.5">
        {left.map((f) => (
          <span
            key={f.id}
            className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-muted-strong shadow-inset-hi"
          >
            {f.label}
          </span>
        ))}
      </div>

      {/* arrow with marching dots */}
      <div className="flex items-center gap-1.5 text-muted">
        <span className="h-px w-4 bg-gradient-to-r from-white/0 to-white/20" />
        <span className="h-1 w-1 rounded-full bg-accent" />
        <span className="h-1 w-1 rounded-full bg-accent/60" />
        <span className="h-1 w-1 rounded-full bg-accent/30" />
        <ArrowUpRight
          size={12}
          strokeWidth={2}
          className="rotate-45 text-accent"
        />
      </div>

      <div className="flex items-center gap-1.5">
        {right.map((f) => (
          <span
            key={f.id}
            className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-muted-strong shadow-inset-hi"
          >
            {f.label}
          </span>
        ))}
      </div>

      <span className="ml-auto hidden text-muted sm:inline">
        6 format · 1 klik · 0 upload pihak ketiga
      </span>
    </div>
  );
}

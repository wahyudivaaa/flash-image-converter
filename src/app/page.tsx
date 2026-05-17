import Converter from "@/components/Converter";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative grain overflow-hidden border-b border-white/5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,119,198,0.18),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            online &middot; vercel edge ready
          </div>
          <h1 className="mt-4 text-4xl sm:text-6xl font-semibold tracking-tight">
            Flash <span className="text-zinc-400">Image</span> Converter
          </h1>
          <p className="mt-4 max-w-xl text-zinc-400 text-base sm:text-lg">
            Konversi cepat antar format gambar — JPEG, PNG, WebP, AVIF, TIFF,
            GIF. Tanpa upload ke pihak ketiga, tanpa watermark.
          </p>
        </div>
      </section>

      {/* App */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Converter />
      </section>

      <footer className="mx-auto max-w-5xl px-6 pb-10 pt-4 text-xs text-zinc-500">
        <p>
          Batas ukuran 4.5 MB per file — limit serverless Vercel. Pemrosesan
          dilakukan via{" "}
          <a
            href="https://sharp.pixelplumbing.com/"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-zinc-300"
          >
            sharp
          </a>{" "}
          di Node runtime.
        </p>
      </footer>
    </main>
  );
}

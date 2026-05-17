"use client";

import { ArrowUpRight, Zap } from "lucide-react";
import { GithubMark } from "./Hero";

export function Footer() {
  return (
    <footer className="relative mt-8 border-t border-white/[0.06] bg-surface/20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent opacity-50"
      />

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:grid-cols-3 sm:gap-4 sm:px-6">
        {/* Brand */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div
              aria-hidden
              className="grid h-5 w-5 place-items-center rounded-[5px] bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5)]"
            >
              <Zap size={11} strokeWidth={2.75} />
            </div>
            <span className="font-mono text-[12.5px] font-medium tracking-tight text-foreground">
              flash<span className="text-muted">/</span>image
            </span>
          </div>
          <p className="max-w-xs text-[12px] leading-relaxed text-muted">
            Konverter gambar serverless. Sharp + Next.js. Tanpa watermark,
            tanpa upload pihak ketiga.
          </p>
        </div>

        {/* Tech */}
        <div className="flex flex-col gap-2 sm:items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            stack
          </span>
          <div className="flex flex-wrap gap-1.5 sm:justify-center">
            {["Next 15", "Sharp 0.33", "Vercel", "Node 22"].map((t) => (
              <span
                key={t}
                className="rounded border border-white/[0.06] bg-white/[0.015] px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-strong"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-col gap-2 sm:items-end">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            tautan
          </span>
          <nav className="flex flex-col gap-1.5 sm:items-end">
            <FooterLink href="https://sharp.pixelplumbing.com/">
              sharp
            </FooterLink>
            <FooterLink href="https://github.com/">github</FooterLink>
            <FooterLink href="https://vercel.com/">vercel</FooterLink>
          </nav>
        </div>
      </div>

      <div className="border-t border-white/[0.04]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-4 font-mono text-[10.5px] uppercase tracking-wider text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-strong">v1.0.0</span>
            <span aria-hidden className="text-white/15">
              ·
            </span>
            <span>node runtime</span>
            <span aria-hidden className="text-white/15">
              ·
            </span>
            <span>MIT</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="inline-flex items-center gap-1 transition-colors duration-fast hover:text-foreground"
            >
              <GithubMark size={11} />
              <span>source</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-1 font-mono text-[12px] text-muted-strong transition-colors duration-fast hover:text-accent"
    >
      <span>{children}</span>
      <ArrowUpRight
        size={11}
        strokeWidth={2}
        className="transition-transform duration-fast group-hover:translate-x-px group-hover:-translate-y-px"
      />
    </a>
  );
}

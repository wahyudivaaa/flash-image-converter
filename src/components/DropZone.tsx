"use client";

import { ACCEPT_INPUT, MAX_BLOB_BYTES, MAX_BYTES } from "@/lib/formats";
import { Plus, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

interface DropZoneProps {
  /** Whether there are any jobs already — switches to compact mode. */
  hasFiles: boolean;
  onFiles: (files: FileList | File[]) => void;
}

export function DropZone({ hasFiles, onFiles }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) onFiles(e.dataTransfer.files);
  };

  // Compact when files are already in the queue — quieter affordance, more breathing room above
  if (hasFiles) {
    return (
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
        aria-label="Tambahkan lebih banyak gambar"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={[
          "group relative flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg px-5 py-4 transition-all duration-base ease-out-quart",
          dragActive
            ? "drop-active text-accent"
            : "border border-dashed border-white/[0.08] bg-surface/30 text-muted hover:border-accent/40 hover:bg-surface/50 hover:text-foreground",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_INPUT}
          className="sr-only"
          onChange={onPick}
        />
        <Plus
          size={14}
          strokeWidth={2.4}
          className="transition-transform duration-base group-hover:rotate-90"
        />
        <span className="text-[13px] font-medium tracking-tight">
          {dragActive ? "Lepaskan untuk menambahkan" : "Tambahkan file lain"}
        </span>
      </div>
    );
  }

  return (
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
      aria-label="Unggah gambar untuk dikonversi"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={[
        "group relative grid cursor-pointer place-items-center overflow-hidden rounded-lg px-6 py-14 transition-all duration-base ease-out-quart sm:py-20",
        dragActive
          ? "drop-active"
          : "border border-white/[0.08] bg-surface/40 hover:border-white/15 hover:bg-surface/60",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_INPUT}
        className="sr-only"
        onChange={onPick}
      />

      <div className="relative text-center">
        <div
          className={[
            "mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border transition-all duration-base ease-out-quart",
            dragActive
              ? "scale-110 border-accent/60 bg-accent/15 text-accent shadow-[0_0_0_4px_rgb(196_240_66_/_0.08),0_8px_32px_-8px_rgb(196_240_66_/_0.4)]"
              : "border-white/10 bg-white/[0.03] text-muted-strong group-hover:scale-105 group-hover:border-white/20 group-hover:bg-white/[0.05] group-hover:text-foreground",
          ].join(" ")}
        >
          <UploadCloud size={26} strokeWidth={1.6} />
        </div>

        <p className="text-[15.5px] font-medium tracking-tight text-foreground sm:text-base">
          {dragActive
            ? "Lepaskan untuk menambahkan ke antrian"
            : "Drag & drop, atau klik untuk pilih file"}
        </p>

        <div className="mt-3 flex flex-col items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted">
          <span>JPG · PNG · WebP · AVIF · TIFF · GIF · SVG</span>
          <span className="flex flex-wrap items-center justify-center gap-x-1.5">
            <span className="text-muted-strong">
              DNG · CR2 · CR3 · NEF · ARW · RW2 · ORF · RAF · PEF
            </span>
            <span aria-hidden className="text-white/20">
              —
            </span>
            <span className="normal-case tracking-normal">RAW kamera</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span aria-hidden className="text-white/15">
              max
            </span>
            <span className="text-muted-strong">
              {(MAX_BYTES / 1024 / 1024).toFixed(1)} MB
            </span>
            <span aria-hidden className="text-white/20">
              /
            </span>
            <span className="text-muted-strong">
              {(MAX_BLOB_BYTES / 1024 / 1024).toFixed(0)} MB
            </span>{" "}
            <span className="normal-case tracking-normal text-muted">
              untuk RAW
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

# Flash Image Converter

Konversi cepat antar format gambar — JPEG, PNG, WebP, AVIF, **TIFF**, GIF — sebagai web app Next.js 15 yang siap deploy ke Vercel.

- Konversi server-side via [`sharp`](https://sharp.pixelplumbing.com/) (Node runtime)
- Drag & drop multi-file, kontrol kualitas, download per file atau semua
- Tanpa upload ke pihak ketiga, tanpa watermark

## Fitur

| Fitur | Detail |
|---|---|
| **Multi-format** | JPEG, PNG, WebP, AVIF, TIFF, GIF, BMP, ICO, PDF (output) — SVG, DNG (input only) |
| **DNG / RAW HP** | Galaxy S22+/S23/S24, Pixel 6+ (passthrough preview) |
| **Resize & preset** | Custom W×H, atau preset Full HD / HD / IG Square / Twitter Card / dll. |
| **Fit mode** | Inside (preserve aspek), Cover (crop), Contain (letterbox) |
| **Rotate** | 0°/90°/180°/270° |
| **Auto-rotate EXIF** | Honor tag Orientation supaya foto HP tidak miring |
| **Strip metadata** | Hapus EXIF/GPS/IPTC untuk privasi (default ON) |
| **Background fill** | Warna latar saat transparansi → JPEG, atau corner setelah rotate |
| **Quality control** | Slider 1-100 untuk format lossy |
| **Batch ZIP download** | Download semua hasil sekaligus sebagai ZIP |
| **Per-file progress** | Antrian dengan status real-time, retry on failure |

## Stack

| Bagian | Pilihan |
|---|---|
| Framework | Next.js 15 (App Router) |
| Runtime API | `nodejs` (sharp = native binding) |
| Image lib | sharp 0.33+ |
| Styling | Tailwind v3 |
| Deploy | Vercel (zero-config) |

## Format yang didukung

| Format | Input | Output | Catatan |
|---|:-:|:-:|---|
| JPEG | ✅ | ✅ | mozjpeg encoder |
| PNG | ✅ | ✅ | palette mode di quality < 80 |
| WebP | ✅ | ✅ | |
| AVIF | ✅ | ✅ | |
| **TIFF** | ✅ | ✅ | LZW compression |
| GIF | ✅ | ✅ | |
| SVG | ✅ (rasterized) | — | |
| **DNG** | ✅ (via Vercel Blob, max 60 MB) | — | passthrough preview JPEG |
| **BMP** | — | ✅ | 24-bit BGR, no compression |
| **ICO** | — | ✅ | 6 sizes embedded (16/32/48/64/128/256) |
| **PDF** | — | ✅ | single-page, fit-to-image |

> HEIC/HEIF, RAW kamera selain DNG (CR2/NEF/ARW), JPEG XL, PSD tidak didukung.
> DNG diproses dengan **mode passthrough** — extract preview JPEG full-resolution yang sudah dirender ISP HP, lalu re-wrap ke format target. Pixel-perfect dengan apa yang ditampilkan kamera.

## Jalankan lokal

```bash
npm install
npm run dev          # http://localhost:3000
```

> Catatan:
> - `sharp` mengunduh prebuilt binary saat install. Pastikan jaringan tersedia.
> - **Filesystem exFAT (mis. drive D:)**: webpack `next build` butuh symlink/readlink yang tidak didukung exFAT. Untuk dev pakai `npm run dev -- --turbopack`. Untuk production cukup `git push` ke Vercel — Linux runner mereka build tanpa masalah.

## Build & test

```bash
# build production (jalankan dari NTFS / Linux / macOS)
npm run build
npm start

# E2E test API: butuh dev server jalan dulu
npm run dev -- --turbopack -p 3739 &
node scripts/test-convert.mjs 3739
```

## Struktur

```
src/
  app/
    api/
      convert/route.ts        # endpoint konversi standar (POST multipart, ≤4.5 MB)
      convert-dng/route.ts    # endpoint DNG (terima Blob URL, kirim hasil ke Blob)
      blob-upload/route.ts    # issue token upload langsung ke Vercel Blob
    layout.tsx
    page.tsx
    globals.css
  components/
    Converter.tsx             # UI utama (client component)
  lib/
    formats.ts                # definisi format & batas
    dng-extract.ts            # parser DNG: ekstrak preview JPEG embedded
public/
  favicon.svg
scripts/
  test-convert.mjs            # E2E test API standar
  test-dng-extract.mjs        # smoke test parser DNG
  dng-to-tiff/                # script lokal Python (batch DNG)
vercel.json                   # config function (memory, duration)
next.config.mjs               # serverExternalPackages, outputFileTracingIncludes
```

## Setup Vercel Blob (untuk DNG)

DNG bisa berukuran 12-30 MB, di atas batas serverless 4.5 MB. Solusinya: client upload langsung ke Vercel Blob, lalu serverless cuma fetch URL-nya.

1. Di Vercel dashboard project: **Storage** → **Create Database** → pilih **Blob**.
2. Vercel otomatis menambahkan environment variable `BLOB_READ_WRITE_TOKEN` ke project.
3. Redeploy project. Selesai.

Tanpa langkah ini, file non-DNG tetap berfungsi (lewat `/api/convert`), tapi upload DNG akan error.

Quota free tier (Hobby): 1 GB storage + 10 GB bandwidth per bulan.

## Ekspansi

- [ ] Vercel Blob direct-upload untuk file >4.5 MB
- [ ] Resize / rotate / strip metadata
- [ ] Batch ZIP download
- [ ] PWA / offline (client-side fallback via `wasm-vips`)

## Lisensi

MIT

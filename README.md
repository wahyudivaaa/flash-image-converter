# Flash Image Converter

Konversi cepat antar format gambar — JPEG, PNG, WebP, AVIF, **TIFF**, GIF — sebagai web app Next.js 15 yang siap deploy ke Vercel.

- Konversi server-side via [`sharp`](https://sharp.pixelplumbing.com/) (Node runtime)
- Drag & drop multi-file, kontrol kualitas, download per file atau semua
- Tanpa upload ke pihak ketiga, tanpa watermark

## Stack

| Bagian | Pilihan |
|---|---|
| Framework | Next.js 15 (App Router) |
| Runtime API | `nodejs` (sharp = native binding) |
| Image lib | sharp 0.33+ |
| Styling | Tailwind v3 |
| Deploy | Vercel (zero-config) |

## Format yang didukung

| Format | Input | Output |
|---|:-:|:-:|
| JPEG | ✅ | ✅ |
| PNG | ✅ | ✅ |
| WebP | ✅ | ✅ |
| AVIF | ✅ | ✅ |
| **TIFF** | ✅ | ✅ |
| GIF | ✅ | ✅ |
| SVG | ✅ (rasterized) | — |

> HEIC/HEIF, RAW kamera (CR2/NEF), PSD tidak didukung. sharp tidak menyertakan paten libheif.

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

## Deploy ke Vercel

Ada 2 cara umum.

### A. Lewat dashboard Vercel (paling mudah)

1. Push project ini ke GitHub / GitLab / Bitbucket.
2. Buka https://vercel.com/new, pilih repo.
3. Framework akan auto-detect **Next.js**. Klik **Deploy**.
4. Selesai. Domain `*.vercel.app` aktif dalam ~1 menit.

### B. Lewat Vercel CLI

```bash
npm i -g vercel
vercel login
vercel              # pertama kali — link/buat project
vercel --prod       # deploy ke production
```

`vercel.json` di repo ini sudah mengatur:

- `maxDuration: 60s` untuk endpoint `/api/convert` (cukup untuk file 4.5 MB)
- `memory: 1024 MB` (sharp + TIFF butuh RAM untuk file besar)

### Batas Vercel yang perlu diingat

| Limit | Nilai |
|---|---|
| Request body | **4.5 MB** (hard cap, semua plan) |
| Response body | 4.5 MB |
| Function bundle | 250 MB gzipped (sharp ~16 MB, aman) |
| Max duration (Hobby) | 60 s (dengan Fluid compute, 300 s) |

Untuk file di atas 4.5 MB, perlu integrasi [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) — direct upload dari client. Tidak termasuk dalam versi awal ini.

## Struktur

```
src/
  app/
    api/convert/route.ts   # endpoint konversi (POST multipart)
    layout.tsx
    page.tsx
    globals.css
  components/
    Converter.tsx          # UI utama (client component)
  lib/
    formats.ts             # definisi format & batas
public/
  favicon.svg
vercel.json                # config function (memory, duration)
next.config.mjs            # serverExternalPackages: ["sharp"]
```

## Ekspansi

- [ ] Vercel Blob direct-upload untuk file >4.5 MB
- [ ] Resize / rotate / strip metadata
- [ ] Batch ZIP download
- [ ] PWA / offline (client-side fallback via `wasm-vips`)

## Lisensi

MIT

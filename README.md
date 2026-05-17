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

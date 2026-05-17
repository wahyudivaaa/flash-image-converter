# DNG → TIFF Converter (Passthrough)

Konversi file DNG dari HP modern (Samsung Galaxy S22+ / S23 / S24, dll.) ke TIFF dengan **piksel persis sama dengan aslinya** — yang berubah cuma container/ekstensi.

## Cara kerjanya

DNG dari HP modern menyimpan dua hal di file yang sama:
1. **Raw data** (Linear DNG, JPEG-XL compressed, 16-bit) — buat editing profesional
2. **Embedded preview JPEG full-resolution** (8-bit RGB) — yang **dirender ISP HP** dengan look, tone curve, color grading, dan post-processing official kamera

Yang kamu lihat saat buka DNG di gallery / file explorer adalah preview #2. Script ini extract preview itu lalu re-wrap dalam container TIFF (LZW lossless). Hasilnya: **piksel-per-piksel sama dengan apa yang HP tampilkan**, hanya ekstensi yang berubah.

## Kenapa pakai mode ini, bukan rendering ulang?

Sebelumnya saya sempat coba rendering ulang dari raw data (linearize → white balance → ForwardMatrix → sRGB). Hasilnya **secara matematis benar** sesuai Adobe DNG spec, tapi tidak match dengan look HP karena:

- HP ber-render dengan tone curve & color grading proprietary (Galaxy Look)
- HP apply scene-detection processing (Astrophoto mode, sky enhancement, dll.)
- Mereplikasi look itu butuh akses Samsung's internal ProfileLookTable yang tidak distandar

Untuk "ekstensi-only conversion", passthrough adalah pendekatan yang benar.

## Persyaratan

- Python 3.10+
- `tifffile`, `imagecodecs` (decode JPEG inside DNG), `numpy`

```bash
pip install tifffile imagecodecs numpy
```

## Pemakaian

```bash
# Default: konversi semua *.dng di C:\Users\wahyu\Downloads\dng
python scripts/dng-to-tiff/convert_dng.py

# Folder lain
python scripts/dng-to-tiff/convert_dng.py "C:\path\to\dng_folder"

# Output kustom
python scripts/dng-to-tiff/convert_dng.py "C:\input" -o "C:\output"

# Atur paralelisme
python scripts/dng-to-tiff/convert_dng.py -w 8

# Re-konversi yang sudah ada
python scripts/dng-to-tiff/convert_dng.py --overwrite
```

## Performance (39 file Galaxy S23, 871 MB)

- **3.6 detik** untuk semua 39 file (6 worker paralel)
- Output: ~11 MB rata-rata per file (8-bit RGB LZW TIFF)
- Total output: 438 MB (sekitar 50% dari ukuran DNG asli)

## Limitasi

- Hanya berfungsi pada DNG yang menyimpan embedded preview full-resolution (mayoritas HP modern). Kalau DNG kamu cuma punya raw data tanpa preview, script akan return `no embedded preview JPEG found`.
- Output adalah **8-bit RGB**, bukan 16-bit. Karena DNG embedded preview memang sudah 8-bit. Kalau butuh 16-bit untuk editing pro, gunakan Adobe DNG Converter / Lightroom / darktable.

## Referensi

- [Adobe DNG 1.7.1 Specification](https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/dng_spec_1_7_1_0.pdf) — bab "Preview Images"
- [TIFF/EP standard](https://www.iso.org/standard/29377.html) — SubIFD structure

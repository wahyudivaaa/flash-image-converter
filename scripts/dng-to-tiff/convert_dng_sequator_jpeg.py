"""
Convert Samsung Linear DNG (JPEG-XL) to Sequator-compatible JPEG.

Sequator handles JPEG natively without issues. We extract the embedded
preview JPEG (already rendered by the phone's ISP), apply EXIF orientation,
and re-save as a high-quality JPEG.

This is the SIMPLEST and most compatible workflow for star stacking with
Samsung Galaxy DNG files in Sequator.

Usage:
    python convert_dng_sequator_jpeg.py [input_dir] [-o output_dir] [-w workers] [--overwrite]
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image


def fmt_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    if n < 1024 * 1024 * 1024:
        return f"{n / 1024 / 1024:.1f} MB"
    return f"{n / 1024 / 1024 / 1024:.2f} GB"


def find_preview_page(tf: tifffile.TiffFile):
    """Locate the largest 8-bit JPEG preview in a DNG."""
    candidates = []
    for page in tf.pages:
        for p in [page] + list(page.pages or []):
            try:
                shape = p.shape
                if len(shape) < 2:
                    continue
                bps_tag = p.tags.get("BitsPerSample")
                bps_val = bps_tag.value if bps_tag else None
                bps_first = bps_val[0] if isinstance(bps_val, tuple) else bps_val
                if bps_first not in (8, None):
                    continue
                comp = int(p.compression)
                ph = int(p.photometric)
                if comp in (6, 7) and ph in (2, 6):
                    h = shape[0]
                    w = shape[1]
                    candidates.append((h * w, p))
            except Exception:
                continue
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def get_orientation(tf: tifffile.TiffFile) -> int:
    try:
        for page in tf.pages:
            tag = page.tags.get("Orientation")
            if tag and tag.value:
                return int(tag.value)
    except Exception:
        pass
    return 1


def apply_orientation_inplace(arr: np.ndarray, orientation: int) -> np.ndarray:
    o = orientation
    if o == 1: return arr
    if o == 2: return np.fliplr(arr)
    if o == 3: return np.rot90(arr, 2)
    if o == 4: return np.flipud(arr)
    if o == 5: return np.rot90(np.fliplr(arr), -1)
    if o == 6: return np.rot90(arr, -1)
    if o == 7: return np.rot90(np.flipud(arr), -1)
    if o == 8: return np.rot90(arr, 1)
    return arr


def convert_one(args: tuple[str, str, int]) -> tuple[str, bool, str, int, int, float]:
    src, dst, quality = args
    name = os.path.basename(src)
    in_size = os.path.getsize(src)
    started = time.perf_counter()
    try:
        with tifffile.TiffFile(src) as tf:
            preview = find_preview_page(tf)
            if preview is None:
                raise RuntimeError("no embedded preview JPEG found")
            rgb = preview.asarray()  # uint8 H,W,3
            orientation = get_orientation(tf)

        if rgb.ndim != 3 or rgb.shape[2] not in (3, 4):
            raise RuntimeError(f"unexpected preview shape: {rgb.shape}")
        rgb = rgb[..., :3].astype(np.uint8)
        rgb = apply_orientation_inplace(rgb, orientation)

        # Save as JPEG via Pillow
        Image.fromarray(rgb).save(dst, "JPEG", quality=quality, optimize=True)

        return (name, True, "ok", in_size, os.path.getsize(dst), time.perf_counter() - started)
    except Exception as e:
        try:
            if os.path.exists(dst) and os.path.getsize(dst) == 0:
                os.remove(dst)
        except OSError:
            pass
        return (name, False, f"{type(e).__name__}: {e}", in_size, 0, time.perf_counter() - started)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="DNG -> Sequator-compatible JPEG (high quality)."
    )
    parser.add_argument(
        "input_dir", nargs="?", default=r"C:\Users\wahyu\Downloads\dng",
        help="Directory containing .dng files",
    )
    parser.add_argument("--output", "-o", default=None,
                        help="Output directory (default: <input_dir>/converted-sequator-jpeg)")
    parser.add_argument("--workers", "-w", type=int,
                        default=max(1, (os.cpu_count() or 2) // 2))
    parser.add_argument("--quality", "-q", type=int, default=95,
                        help="JPEG quality (default: 95)")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.is_dir():
        print(f"ERROR: input directory not found: {input_dir}", file=sys.stderr)
        return 2

    output_dir = Path(args.output) if args.output else input_dir / "converted-sequator-jpeg"
    output_dir.mkdir(parents=True, exist_ok=True)

    dng_files = sorted(p for p in input_dir.iterdir() if p.suffix.lower() == ".dng" and p.is_file())
    if not dng_files:
        print(f"No .dng files in {input_dir}")
        return 0

    total_in = sum(p.stat().st_size for p in dng_files)
    print(f"Source     : {input_dir}")
    print(f"Destination: {output_dir}")
    print(f"Files      : {len(dng_files)}  ({fmt_bytes(total_in)})")
    print(f"Workers    : {args.workers}")
    print(f"Quality    : {args.quality}")
    print(f"Mode       : Sequator-compat (high-quality JPEG)")
    print()

    jobs: list[tuple[str, str, int]] = []
    skipped = 0
    for src in dng_files:
        dst = output_dir / (src.stem + ".jpg")
        if dst.exists() and not args.overwrite:
            skipped += 1
            continue
        jobs.append((str(src), str(dst), args.quality))

    if skipped:
        print(f"  Skipping {skipped} already-converted file(s). Use --overwrite to redo.")

    if not jobs:
        print("Nothing to do.")
        return 0

    started = time.perf_counter()
    succeeded = 0
    failed = 0
    total_out = 0
    width = max(len(os.path.basename(j[0])) for j in jobs)

    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(convert_one, j): j for j in jobs}
        for i, fut in enumerate(as_completed(futures), start=1):
            name, ok, msg, in_sz, out_sz, dur = fut.result()
            if ok:
                succeeded += 1
                total_out += out_sz
                ratio = (out_sz / in_sz) if in_sz else 0
                print(
                    f"  [{i:2d}/{len(jobs)}] {name:<{width}}  "
                    f"{fmt_bytes(in_sz):>9}  ->  {fmt_bytes(out_sz):>9}  "
                    f"({ratio*100:5.1f}%)  {dur:5.2f}s"
                )
            else:
                failed += 1
                print(f"  [{i:2d}/{len(jobs)}] {name:<{width}}  FAILED  {msg}")

    elapsed = time.perf_counter() - started
    print()
    print(f"=== Done in {elapsed:.1f}s ===")
    print(f"Succeeded: {succeeded}/{len(jobs)}")
    if failed:
        print(f"Failed   : {failed}")
    if succeeded:
        print(f"Output   : {fmt_bytes(total_out)} total ({fmt_bytes(total_out // succeeded)} avg)")
        print(f"Location : {output_dir}")
        print()
        print("Next: drag-drop these *.jpg into Sequator. Project -> New, click")
        print("'Star images', select all 39 files. Sequator will accept them.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

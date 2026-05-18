"""
Star stacker for Samsung Galaxy DNG files. Standalone, no Sequator needed.

Pipeline:
    1. Read embedded preview JPEG from each DNG (the rendered ISP output)
    2. Apply EXIF orientation
    3. Pick the median-quality frame as reference (or a user-chosen index)
    4. Use astroalign to detect stars and align all other frames to reference
    5. Stack frames using mean / median / sigma-clipped mean
    6. Save final stacked image as TIFF

Usage:
    python stack_dng.py [input_dir] [-o output.tiff] [-r reference_index] [-m method]

Methods:
    median   - robust to satellite trails / planes (Recommended)
    mean     - cleanest noise reduction if no outliers
    sigma    - sigma-clipped mean, balance between the two
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


def find_preview_page(tf: tifffile.TiffFile):
    candidates = []
    for page in tf.pages:
        for p in [page] + list(page.pages or []):
            try:
                if len(p.shape) < 2:
                    continue
                bps_tag = p.tags.get("BitsPerSample")
                bps_val = bps_tag.value if bps_tag else None
                bps_first = bps_val[0] if isinstance(bps_val, tuple) else bps_val
                if bps_first not in (8, None):
                    continue
                comp = int(p.compression)
                ph = int(p.photometric)
                if comp in (6, 7) and ph in (2, 6):
                    candidates.append((p.shape[0] * p.shape[1], p))
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


def apply_orientation(arr: np.ndarray, o: int) -> np.ndarray:
    if o == 1: return arr
    if o == 2: return np.fliplr(arr)
    if o == 3: return np.rot90(arr, 2)
    if o == 4: return np.flipud(arr)
    if o == 5: return np.rot90(np.fliplr(arr), -1)
    if o == 6: return np.rot90(arr, -1)
    if o == 7: return np.rot90(np.flipud(arr), -1)
    if o == 8: return np.rot90(arr, 1)
    return arr


def load_frame(path: str) -> np.ndarray:
    """Load DNG -> uint8 RGB numpy array, orientation applied."""
    with tifffile.TiffFile(path) as tf:
        preview = find_preview_page(tf)
        if preview is None:
            raise RuntimeError(f"no embedded preview in {path}")
        arr = preview.asarray()
        orientation = get_orientation(tf)
    if arr.ndim != 3 or arr.shape[2] not in (3, 4):
        raise RuntimeError(f"unexpected shape: {arr.shape}")
    arr = arr[..., :3].astype(np.uint8)
    return apply_orientation(arr, orientation)


def fmt_bytes(n: int) -> str:
    if n < 1024 * 1024: return f"{n / 1024:.1f} KB"
    if n < 1024 * 1024 * 1024: return f"{n / 1024 / 1024:.1f} MB"
    return f"{n / 1024 / 1024 / 1024:.2f} GB"


def main() -> int:
    parser = argparse.ArgumentParser(description="Star stacker for Samsung Galaxy DNG.")
    parser.add_argument("input_dir", nargs="?", default=r"C:\Users\wahyu\Downloads\dng")
    parser.add_argument("--output", "-o",
                        default=r"C:\Users\wahyu\Downloads\dng\stacked.tiff")
    parser.add_argument("--reference", "-r", type=int, default=None,
                        help="Reference frame index (0-based). Default: middle of the set.")
    parser.add_argument("--method", "-m", choices=["mean", "median", "sigma"], default="median")
    parser.add_argument("--sigma-low", type=float, default=2.0)
    parser.add_argument("--sigma-high", type=float, default=2.0)
    parser.add_argument("--max-frames", type=int, default=None,
                        help="Limit to first N frames (for quick testing)")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.is_dir():
        print(f"ERROR: not a directory: {input_dir}", file=sys.stderr)
        return 2

    dng_files = sorted(p for p in input_dir.iterdir()
                       if p.suffix.lower() == ".dng" and p.is_file())
    if args.max_frames:
        dng_files = dng_files[:args.max_frames]
    if not dng_files:
        print("No .dng files found.", file=sys.stderr)
        return 2

    print(f"Source        : {input_dir}")
    print(f"Frames        : {len(dng_files)}")
    print(f"Method        : {args.method}")
    print(f"Output        : {args.output}")
    print()

    # Load all frames
    print("Loading frames...")
    t0 = time.perf_counter()
    frames = []
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) // 2)) as pool:
        futures = {pool.submit(load_frame, str(f)): i for i, f in enumerate(dng_files)}
        results = [None] * len(dng_files)
        for fut in as_completed(futures):
            idx = futures[fut]
            try:
                results[idx] = fut.result()
            except Exception as e:
                print(f"  [{idx:2d}] FAIL: {e}")
                return 1
        frames = [r for r in results if r is not None]
    print(f"  Loaded {len(frames)} in {time.perf_counter()-t0:.1f}s. Shape: {frames[0].shape}")

    # Pick reference
    ref_idx = args.reference if args.reference is not None else len(frames) // 2
    ref = frames[ref_idx]
    print(f"\nReference     : frame {ref_idx} ({dng_files[ref_idx].name})")

    # Align via astroalign — use grayscale of each frame to detect star pattern
    import astroalign as aa
    print("\nAligning...")
    aligned = []
    aligned.append(ref.astype(np.float32))  # ref frame is already aligned to itself
    failed = 0
    t0 = time.perf_counter()
    for i, frame in enumerate(frames):
        if i == ref_idx:
            continue
        try:
            # astroalign works in 2D (grayscale). Compute transform on luminance,
            # apply to each RGB channel.
            ref_gray = ref.mean(axis=2).astype(np.float32)
            frame_gray = frame.mean(axis=2).astype(np.float32)
            transform, _ = aa.find_transform(frame_gray, ref_gray)
            # Apply transform to each channel
            channels = []
            for c in range(3):
                ch, _ = aa.apply_transform(transform, frame[..., c].astype(np.float32),
                                            ref[..., c].astype(np.float32))
                channels.append(ch)
            warped = np.stack(channels, axis=2)
            aligned.append(warped)
            print(f"  [{i+1:2d}/{len(frames)}] {dng_files[i].name}  aligned")
        except Exception as e:
            failed += 1
            print(f"  [{i+1:2d}/{len(frames)}] {dng_files[i].name}  FAIL: {type(e).__name__}: {e}")
    print(f"  Aligned {len(aligned)} of {len(frames)} in {time.perf_counter()-t0:.1f}s ({failed} failed)")

    if len(aligned) < 2:
        print("Not enough aligned frames to stack.", file=sys.stderr)
        return 1

    # Stack
    print(f"\nStacking with method={args.method}...")
    t0 = time.perf_counter()
    stack = np.stack(aligned, axis=0)  # (N, H, W, 3) float32
    if args.method == "mean":
        result = stack.mean(axis=0)
    elif args.method == "median":
        result = np.median(stack, axis=0)
    elif args.method == "sigma":
        # Sigma-clipped mean: rejects outliers (satellites, planes)
        mean = stack.mean(axis=0, keepdims=True)
        std = stack.std(axis=0, keepdims=True)
        lo = mean - args.sigma_low * std
        hi = mean + args.sigma_high * std
        mask = (stack >= lo) & (stack <= hi)
        # Replace clipped values with the per-pixel mean to avoid NaN propagation
        clipped = np.where(mask, stack, np.nan)
        result = np.nanmean(clipped, axis=0)
    print(f"  Stacked in {time.perf_counter()-t0:.1f}s")

    # Output as 8-bit TIFF (matches input bit depth) so the result feels "the same"
    result = np.clip(result, 0, 255).astype(np.uint8)

    # Save with proper TIFF
    print(f"\nSaving to {args.output} ...")
    tifffile.imwrite(args.output, result, photometric="rgb", compression="lzw",
                     metadata=None)
    print(f"  {fmt_bytes(os.path.getsize(args.output))} written")

    # Also save a JPEG side-by-side for easy preview
    jpg_out = str(Path(args.output).with_suffix(".jpg"))
    Image.fromarray(result).save(jpg_out, "JPEG", quality=95, optimize=True)
    print(f"  Preview JPEG: {jpg_out} ({fmt_bytes(os.path.getsize(jpg_out))})")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

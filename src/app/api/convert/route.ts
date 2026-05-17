import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  MAX_BYTES,
  formatById,
  isOutputFormat,
  type OutputFormat,
} from "@/lib/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConvertOptions {
  format: OutputFormat;
  quality: number;
}

function parseQuality(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 80;
  return Math.min(100, Math.max(1, Math.round(n)));
}

async function convertBuffer(
  input: Buffer,
  opts: ConvertOptions,
): Promise<Buffer> {
  // failOn:"none" → don't bail on truncated/odd sources, mirror common viewer behavior
  const pipeline = sharp(input, { failOn: "none", animated: opts.format === "gif" });

  switch (opts.format) {
    case "jpeg":
      return pipeline
        .jpeg({ quality: opts.quality, mozjpeg: true })
        .toBuffer();
    case "png":
      return pipeline
        .png({ compressionLevel: 9, palette: opts.quality < 80 })
        .toBuffer();
    case "webp":
      return pipeline.webp({ quality: opts.quality }).toBuffer();
    case "avif":
      return pipeline.avif({ quality: opts.quality, effort: 4 }).toBuffer();
    case "tiff":
      return pipeline
        .tiff({ compression: "lzw", quality: opts.quality })
        .toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
  }
}

export async function POST(req: NextRequest) {
  // Pre-flight content length check (saves a buffer on oversize uploads)
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File terlalu besar. Maksimal ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB (batas Vercel).`,
      },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Body bukan multipart/form-data yang valid." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const formatRaw = String(form.get("format") ?? "");
  const quality = parseQuality(form.get("quality"));

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Field 'file' wajib diisi." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File kosong." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB). Maksimal ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`,
      },
      { status: 413 },
    );
  }

  if (!isOutputFormat(formatRaw)) {
    return NextResponse.json(
      { error: `Format tujuan '${formatRaw}' tidak didukung.` },
      { status: 400 },
    );
  }

  const meta = formatById(formatRaw)!;

  let outBuf: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    outBuf = await convertBuffer(input, { format: formatRaw, quality });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Gagal konversi: ${msg}` },
      { status: 422 },
    );
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  const outName = `${baseName}.${meta.ext}`;

  // Cast to Uint8Array – Next.js Response accepts BodyInit
  const body = new Uint8Array(outBuf);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": meta.mime,
      "Content-Length": String(outBuf.byteLength),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(outName)}"`,
      "X-Output-Filename": encodeURIComponent(outName),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "POST a multipart/form-data body with fields: file, format, quality.",
  });
}

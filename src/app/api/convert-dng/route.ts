import { del, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { extractDngPreview } from "@/lib/dng-extract";
import { formatById, isOutputFormat, type OutputFormat } from "@/lib/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConvertDngRequest {
  blobUrl: string;
  format: string;
  quality?: number;
  originalName?: string;
}

interface ConvertDngResponse {
  outputUrl: string;
  outputName: string;
  outputSize: number;
  contentType: string;
}

function parseQuality(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 90;
  return Math.min(100, Math.max(1, Math.round(n)));
}

async function encode(
  jpegBytes: Uint8Array,
  format: OutputFormat,
  quality: number,
): Promise<Buffer> {
  // We feed the embedded JPEG directly into sharp so the pixel data is decoded
  // exactly once. This preserves the camera's rendered look.
  const pipeline = sharp(jpegBytes, { failOn: "none" });
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    case "png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case "webp":
      return pipeline.webp({ quality }).toBuffer();
    case "avif":
      return pipeline.avif({ quality, effort: 4 }).toBuffer();
    case "tiff":
      return pipeline.tiff({ compression: "lzw", quality }).toBuffer();
    case "gif":
      return pipeline.gif().toBuffer();
  }
}

export async function POST(req: NextRequest) {
  let body: ConvertDngRequest;
  try {
    body = (await req.json()) as ConvertDngRequest;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.blobUrl || typeof body.blobUrl !== "string") {
    return NextResponse.json({ error: "blobUrl wajib diisi." }, { status: 400 });
  }
  if (!isOutputFormat(body.format)) {
    return NextResponse.json(
      { error: `Format tujuan '${body.format}' tidak didukung.` },
      { status: 400 },
    );
  }
  const meta = formatById(body.format)!;
  const quality = parseQuality(body.quality);

  // Fetch DNG bytes from the uploaded blob
  let dngBytes: Uint8Array;
  try {
    const res = await fetch(body.blobUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mengambil blob (${res.status}).` }, { status: 502 });
    }
    dngBytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch error";
    return NextResponse.json({ error: `Gagal fetch blob: ${msg}` }, { status: 502 });
  }

  // Extract embedded preview JPEG (the rendered ISP output)
  const preview = extractDngPreview(dngBytes);
  if (!preview) {
    return NextResponse.json(
      {
        error:
          "DNG ini tidak menyimpan preview JPEG full-resolution. " +
          "Pastikan file dari kamera modern (Galaxy S22+/S23/S24, Pixel 6+, dll.).",
      },
      { status: 422 },
    );
  }

  // Re-encode to target format
  let outBuf: Buffer;
  try {
    outBuf = await encode(preview.jpeg, body.format, quality);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "encode error";
    return NextResponse.json({ error: `Gagal encode: ${msg}` }, { status: 422 });
  }

  // Build output name
  const baseName = (body.originalName ?? "image").replace(/\.[^.]+$/, "") || "image";
  const outName = `${baseName}.${meta.ext}`;

  // Upload result back to Vercel Blob so the browser can download it.
  // Response body cap is also 4.5 MB, so direct return won't work for large files.
  const outputBlob = await put(`outputs/${Date.now()}-${outName}`, outBuf, {
    access: "public",
    contentType: meta.mime,
    addRandomSuffix: true,
  });

  // Best-effort: clean up the input blob; we don't need to keep DNG uploads.
  try {
    await del(body.blobUrl);
  } catch {
    /* ignore */
  }

  const response: ConvertDngResponse = {
    outputUrl: outputBlob.url,
    outputName: outName,
    outputSize: outBuf.byteLength,
    contentType: meta.mime,
  };
  return NextResponse.json(response);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'POST { "blobUrl": "...", "format": "tiff|jpeg|png|webp|avif|gif", "quality": 1-100, "originalName": "..." }',
  });
}

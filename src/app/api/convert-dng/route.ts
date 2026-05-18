import { del, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { extractRawPreview } from "@/lib/raw-extract";
import { formatById, isOutputFormat } from "@/lib/formats";
import { convertWithPipeline, parseOptions } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConvertDngRequest {
  blobUrl: string;
  format: string;
  originalName?: string;
  quality?: number;
  resizeWidth?: number;
  resizeHeight?: number;
  resizeFit?: string;
  rotate?: number;
  autoOrient?: boolean;
  stripMetadata?: boolean;
  background?: string;
}

interface ConvertDngResponse {
  outputUrl: string;
  outputName: string;
  outputSize: number;
  contentType: string;
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
  const options = parseOptions(body as unknown as Record<string, unknown>);

  // Fetch RAW bytes from the uploaded blob
  let rawBytes: Uint8Array;
  try {
    const res = await fetch(body.blobUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mengambil blob (${res.status}).` }, { status: 502 });
    }
    rawBytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch error";
    return NextResponse.json({ error: `Gagal fetch blob: ${msg}` }, { status: 502 });
  }

  // Extract embedded preview JPEG (works across DNG, CR2, CR3, NEF, ARW, RW2, ORF, RAF, PEF)
  const preview = extractRawPreview(rawBytes, body.originalName);
  if (!preview) {
    return NextResponse.json(
      {
        error:
          "File RAW ini tidak menyimpan preview JPEG full-resolution yang bisa dibaca. " +
          "Format yang didukung: DNG, CR2, CR3, NEF, ARW, RW2, ORF, RAF, PEF.",
      },
      { status: 422 },
    );
  }

  // Re-encode through the shared pipeline so resize/rotate/etc. apply.
  let outBuf: Buffer;
  try {
    outBuf = await convertWithPipeline({
      input: preview.jpeg,
      format: body.format,
      options,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "encode error";
    return NextResponse.json({ error: `Gagal encode: ${msg}` }, { status: 422 });
  }

  // Build output name
  const baseName = (body.originalName ?? "image").replace(/\.[^.]+$/, "") || "image";
  const outName = `${baseName}.${meta.ext}`;

  // Upload result back to Vercel Blob so the browser can download it.
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
      'POST { "blobUrl": "...", "format": "tiff|jpeg|png|webp|avif|gif", "quality": 1-100, "resizeWidth": 1920, "resizeHeight": 1080, "resizeFit": "inside|cover|contain", "rotate": 0|90|180|270, "autoOrient": bool, "stripMetadata": bool, "background": "#fff", "originalName": "..." }',
  });
}

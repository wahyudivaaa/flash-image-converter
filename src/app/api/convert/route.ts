import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES, formatById, isOutputFormat } from "@/lib/formats";
import { convertWithPipeline, parseOptions } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Collect all user options into a single bag and let the parser sanitize
  const rawOptions: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k !== "file") rawOptions[k] = v;
  }
  const options = parseOptions(rawOptions);

  let outBuf: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    outBuf = await convertWithPipeline({ input, format: formatRaw, options });
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
    message:
      "POST a multipart/form-data body with fields: file, format, quality, " +
      "resizeWidth, resizeHeight, resizeFit (inside|cover|contain), rotate (0|90|180|270), " +
      "autoOrient (true|false), stripMetadata (true|false), background (#hex).",
  });
}

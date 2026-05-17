import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { isOutputFormat } from "@/lib/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues short-lived upload tokens so the browser can PUT a large DNG
 * directly into Vercel Blob (bypassing the 4.5 MB serverless body cap).
 *
 * The browser hits this endpoint once before the upload to get a token,
 * then uploads to the blob URL it receives, then sends the blob URL to
 * /api/convert-dng for processing.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // pathname is what the client provided; we sandbox uploads under "uploads/"
        // and only allow DNG/TIFF mime types up to 60 MB.
        let payloadFormat = "tiff";
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload) as { format?: string };
            if (parsed.format && isOutputFormat(parsed.format)) {
              payloadFormat = parsed.format;
            }
          } catch {
            /* ignore — default to tiff */
          }
        }
        return {
          allowedContentTypes: [
            "image/x-adobe-dng",
            "image/dng",
            "image/tiff",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 60 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            pathname,
            requestedFormat: payloadFormat,
          }),
        };
      },
      onUploadCompleted: async () => {
        // No-op for now. Could log or track uploads here.
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload init failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

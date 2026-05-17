/**
 * E2E test against deployed Vercel app:
 *   1. Get upload token from /api/blob-upload
 *   2. Upload a DNG to Vercel Blob direct
 *   3. POST blob URL to /api/convert-dng
 *   4. Download the result and verify magic bytes
 *
 * Run: node scripts/test-blob-flow.mjs <base-url> <dng-path> <format>
 *   base-url: e.g. https://flash-image-converter-...vercel.app  OR  http://localhost:3744
 *   dng-path: absolute path to a .dng file
 *   format:   tiff|jpeg|png|webp|avif|gif (default: tiff)
 */
import fs from "node:fs";
import path from "node:path";
import { upload } from "@vercel/blob/client";

const baseUrl = process.argv[2];
const dngPath = process.argv[3];
const format = process.argv[4] ?? "tiff";

if (!baseUrl || !dngPath) {
  console.error("usage: node test-blob-flow.mjs <base-url> <dng-path> [format]");
  process.exit(2);
}

const token401Hint = (status, body) =>
  status === 401
    ? "\nHINT: 401 likely means Vercel Deployment Protection is enabled. Disable in: Settings → Deployment Protection."
    : status === 404
      ? "\nHINT: 404 — the endpoint may not be deployed (check production has /api/blob-upload)."
      : "";

async function main() {
  const fileName = path.basename(dngPath);
  const fileBuffer = fs.readFileSync(dngPath);
  const file = new Blob([fileBuffer], { type: "application/octet-stream" });
  // @vercel/blob client `upload` expects a real File object; provide a Polyfill
  const fileLike = new File([file], fileName, { type: "application/octet-stream" });

  console.log(`Target  : ${baseUrl}`);
  console.log(`DNG     : ${dngPath} (${fileBuffer.length} bytes)`);
  console.log(`Format  : ${format}`);
  console.log();

  // 1) Upload via @vercel/blob/client (it does the token dance with handleUploadUrl)
  console.log("[1] Uploading to Vercel Blob via /api/blob-upload...");
  let blob;
  try {
    blob = await upload(fileName, fileLike, {
      access: "public",
      handleUploadUrl: `${baseUrl}/api/blob-upload`,
      contentType: "application/octet-stream",
      clientPayload: JSON.stringify({ format }),
    });
  } catch (e) {
    console.error("FAILED upload:", e.message);
    if (e.cause) console.error("cause:", e.cause);
    process.exit(1);
  }
  console.log(`    OK -> ${blob.url}`);
  console.log();

  // 2) Convert
  console.log("[2] POSTing /api/convert-dng...");
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/convert-dng`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: blob.url,
      format,
      quality: 90,
      originalName: fileName,
    }),
  });
  const dur = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`    status: ${res.status} (${dur}s)`);
  if (!res.ok) {
    const text = await res.text();
    console.error("    body:", text.slice(0, 500));
    console.error(token401Hint(res.status, text));
    process.exit(1);
  }
  const result = await res.json();
  console.log(`    output: ${result.outputName} (${result.outputSize} bytes, ${result.contentType})`);
  console.log(`    url   : ${result.outputUrl}`);
  console.log();

  // 3) Verify result downloadable + valid file
  console.log("[3] Downloading result for magic-byte check...");
  const r2 = await fetch(result.outputUrl);
  if (!r2.ok) {
    console.error(`    FAILED to download: ${r2.status}`);
    process.exit(1);
  }
  const out = Buffer.from(await r2.arrayBuffer());
  console.log(`    downloaded: ${out.length} bytes`);

  const magicChecks = {
    tiff: () => (out[0] === 0x49 && out[1] === 0x49) || (out[0] === 0x4d && out[1] === 0x4d),
    jpeg: () => out[0] === 0xff && out[1] === 0xd8,
    png: () => out[0] === 0x89 && out[1] === 0x50 && out[2] === 0x4e && out[3] === 0x47,
    webp: () => out.slice(0, 4).toString("ascii") === "RIFF" && out.slice(8, 12).toString("ascii") === "WEBP",
    avif: () => out.slice(4, 12).toString("ascii").includes("ftypavif") || out.slice(4, 12).toString("ascii").includes("ftypheic"),
    gif: () => out.slice(0, 3).toString("ascii") === "GIF",
  };
  const check = magicChecks[format];
  if (check && check()) {
    console.log(`    magic bytes: VALID ${format.toUpperCase()}`);
  } else {
    console.log(`    magic bytes: UNEXPECTED (first 8 = ${out.slice(0, 8).toString("hex")})`);
  }

  // Save locally for visual check
  const outPath = path.resolve(process.cwd(), `.dng-test-output.${format === "jpeg" ? "jpg" : format}`);
  fs.writeFileSync(outPath, out);
  console.log(`    saved : ${outPath}`);

  console.log("\nOK — full DNG -> Blob -> Convert -> Blob -> Download flow works end-to-end.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});

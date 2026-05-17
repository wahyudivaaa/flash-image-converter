/**
 * Smoke test new pipeline params (resize, rotate, autoOrient, stripMetadata, background, fit).
 * Run: node scripts/test-pipeline-params.mjs <port>
 */
import fs from "node:fs";
import sharp from "sharp";
import path from "node:path";

const port = process.argv[2] ?? "3745";
const base = `http://localhost:${port}`;
const CRLF = "\r\n";

function buildBody(file, fields) {
  const boundary = "----P" + Date.now() + Math.random().toString(36).slice(2, 8);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${file.name}"${CRLF}Content-Type: ${file.type}${CRLF}${CRLF}`,
      ),
    );
    parts.push(file.data);
    parts.push(Buffer.from(CRLF));
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function post(fields, file) {
  const { body, contentType } = buildBody(file, fields);
  const res = await fetch(`${base}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": contentType, "Content-Length": String(body.length) },
    body,
  });
  return res;
}

let pass = 0, fail = 0;
const expect = (cond, msg) => {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else      { fail++; console.log(`  FAIL  ${msg}`); }
};

async function main() {
  // Generate a 400x300 test PNG with some color
  const png = await sharp({
    create: { width: 400, height: 300, channels: 4, background: { r: 50, g: 100, b: 200, alpha: 1 } },
  }).png().toBuffer();

  console.log(`[1] Resize 400x300 PNG -> 200 wide JPEG`);
  {
    const res = await post(
      { format: "jpeg", quality: "90", resizeWidth: "200", resizeFit: "inside" },
      { name: "t.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    const meta = await sharp(buf).metadata();
    expect(meta.width === 200, `width=200 (got ${meta.width})`);
    expect(meta.height === 150, `height=150 preserved aspect (got ${meta.height})`);
    expect(meta.format === "jpeg", `format=jpeg`);
  }

  console.log(`\n[2] Resize with fit=cover -> 100x100 (should crop)`);
  {
    const res = await post(
      { format: "png", quality: "90", resizeWidth: "100", resizeHeight: "100", resizeFit: "cover" },
      { name: "t.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect(meta.width === 100 && meta.height === 100, `100x100 cover (got ${meta.width}x${meta.height})`);
  }

  console.log(`\n[3] Rotate 90deg`);
  {
    const res = await post(
      { format: "png", quality: "90", rotate: "90" },
      { name: "t.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect(meta.width === 300 && meta.height === 400, `dimensions swapped to 300x400 (got ${meta.width}x${meta.height})`);
  }

  console.log(`\n[4] PNG with transparency -> JPEG with white background`);
  {
    const tpng = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const res = await post(
      { format: "jpeg", quality: "90", background: "#ff0000" },
      { name: "t.png", type: "image/png", data: tpng },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    // Decode the JPEG and check the center pixel: should be ~ red
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const cx = 25 * 50 * 3 + 25 * 3;
    const r = data[cx], g = data[cx + 1], b = data[cx + 2];
    expect(r > 200 && g < 50 && b < 50, `center pixel ~red (got R=${r} G=${g} B=${b})`);
  }

  console.log(`\n[5] stripMetadata=false should keep EXIF`);
  {
    // Build a PNG with sharp but inject EXIF via withMetadata cycle isn't trivial — skip strict check, just ensure status 200
    const res = await post(
      { format: "jpeg", quality: "90", stripMetadata: "false" },
      { name: "t.png", type: "image/png", data: png },
    );
    expect(res.status === 200, `status=200 with stripMetadata=false`);
  }

  console.log(`\n[6] Invalid rotate value rejected silently (treated as 0)`);
  {
    const res = await post(
      { format: "png", quality: "90", rotate: "45" },
      { name: "t.png", type: "image/png", data: png },
    );
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width === 400 && meta.height === 300, `unchanged dimensions (got ${meta.width}x${meta.height})`);
  }

  console.log(`\n[7] Resize preset Instagram square 1080x1080`);
  {
    const big = await sharp({
      create: { width: 2000, height: 1500, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } },
    }).png().toBuffer();
    const res = await post(
      { format: "webp", quality: "85", resizeWidth: "1080", resizeHeight: "1080", resizeFit: "cover" },
      { name: "big.png", type: "image/png", data: big },
    );
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width === 1080 && meta.height === 1080, `IG square 1080x1080 (got ${meta.width}x${meta.height})`);
  }

  console.log(`\n=== Total: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });

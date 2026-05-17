/**
 * E2E test: convert PNG to multiple formats via /api/convert
 * Run: node scripts/test-convert.mjs <port>
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const port = process.argv[2] ?? "3738";
const base = `http://localhost:${port}`;
const CRLF = "\r\n";

function buildBody(file, fields) {
  const boundary = "----CONV" + Date.now() + Math.random().toString(36).slice(2, 8);
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

async function main() {
  console.log(`Target: ${base}/api/convert`);

  // Generate a small input PNG
  const inputPath = path.resolve("test-input.png");
  await sharp({
    create: { width: 200, height: 120, channels: 4, background: { r: 30, g: 80, b: 200, alpha: 1 } },
  })
    .png()
    .toFile(inputPath);
  const png = fs.readFileSync(inputPath);
  console.log(`Input PNG: ${png.length} bytes`);

  let pass = 0;
  let fail = 0;
  const expect = (cond, msg) => {
    if (cond) {
      pass++;
      console.log(`  PASS  ${msg}`);
    } else {
      fail++;
      console.log(`  FAIL  ${msg}`);
    }
  };

  // Test 1: PNG -> TIFF
  console.log("\n[1] PNG -> TIFF");
  {
    const res = await post(
      { format: "tiff", quality: "85" },
      { name: "test.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    expect(res.headers.get("content-type") === "image/tiff", `content-type=image/tiff`);
    expect(buf.length > 0, `body has bytes (${buf.length})`);
    fs.writeFileSync("test-output.tiff", buf);
    try {
      const meta = await sharp(buf).metadata();
      expect(meta.format === "tiff", `sharp identifies format=tiff (got ${meta.format})`);
      expect(meta.width === 200 && meta.height === 120, `dimensions preserved 200x120`);
    } catch (e) {
      expect(false, `decode TIFF failed: ${e.message}`);
    }
  }

  // Test 2: PNG -> WebP
  console.log("\n[2] PNG -> WebP");
  {
    const res = await post(
      { format: "webp", quality: "80" },
      { name: "test.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    expect(res.headers.get("content-type") === "image/webp", `content-type=image/webp`);
    // WebP magic: "RIFF....WEBP"
    expect(
      buf.slice(0, 4).toString("ascii") === "RIFF" &&
        buf.slice(8, 12).toString("ascii") === "WEBP",
      `WebP magic bytes`,
    );
  }

  // Test 3: PNG -> JPEG
  console.log("\n[3] PNG -> JPEG");
  {
    const res = await post(
      { format: "jpeg", quality: "70" },
      { name: "test.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    // JPEG magic: FF D8 FF
    expect(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, `JPEG magic bytes`);
  }

  // Test 4: TIFF -> PNG (round trip)
  console.log("\n[4] TIFF -> PNG (round trip)");
  {
    const tiff = fs.readFileSync("test-output.tiff");
    const res = await post(
      { format: "png", quality: "100" },
      { name: "test.tiff", type: "image/tiff", data: tiff },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    // PNG magic: 89 50 4E 47
    expect(
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
      `PNG magic bytes`,
    );
  }

  // Test 5: oversize -> 413
  console.log("\n[5] Oversize file -> 413");
  {
    const big = Buffer.alloc(5 * 1024 * 1024, 0xff);
    const res = await post(
      { format: "jpeg" },
      { name: "big.bin", type: "application/octet-stream", data: big },
    );
    expect(res.status === 413, `status=413 (got ${res.status})`);
  }

  // Test 6: bad format -> 400
  console.log("\n[6] Unsupported format -> 400");
  {
    const res = await post(
      { format: "psd" },
      { name: "x.png", type: "image/png", data: png },
    );
    expect(res.status === 400, `status=400 (got ${res.status})`);
  }

  // Test 7: missing file -> 400
  console.log("\n[7] Missing file -> 400");
  {
    const res = await post({ format: "jpeg" }, null);
    expect(res.status === 400, `status=400 (got ${res.status})`);
  }

  // Test 8: corrupt body -> 422
  console.log("\n[8] Corrupt image bytes -> 422");
  {
    const garbage = Buffer.from("not actually an image at all, just text bytes");
    const res = await post(
      { format: "jpeg" },
      { name: "fake.png", type: "image/png", data: garbage },
    );
    expect(res.status === 422 || res.status === 400, `status=422 or 400 (got ${res.status})`);
  }

  // Cleanup
  fs.unlinkSync(inputPath);
  if (fs.existsSync("test-output.tiff")) fs.unlinkSync("test-output.tiff");

  console.log(`\n=== Total: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});

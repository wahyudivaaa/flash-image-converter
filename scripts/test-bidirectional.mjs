/**
 * Smoke tests for new format support:
 *   - BMP/ICO/PDF as INPUT (decoded by our decoders, then re-encoded)
 *   - DNG as OUTPUT (Linear DNG, hand-written TIFF)
 *   - SVG as OUTPUT (raster -> vector via imagetracerjs)
 *
 * Run: node scripts/test-bidirectional.mjs <port>
 */
import fs from "node:fs";
import sharp from "sharp";
import path from "node:path";

const port = process.argv[2] ?? "3760";
const base = `http://localhost:${port}`;
const CRLF = "\r\n";

function buildBody(file, fields) {
  const boundary = "----B" + Date.now() + Math.random().toString(36).slice(2, 8);
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
  // === Build a test BMP using our own encoder logic (24-bit BGR, bottom-up) ===
  // 4x3 red image, padded
  const w = 4, h = 3;
  const rowBytes = w * 3;
  const pad = (4 - (rowBytes % 4)) % 4;
  const paddedRow = rowBytes + pad;
  const fileSize = 54 + paddedRow * h;
  const bmp = Buffer.alloc(fileSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(w, 18);
  bmp.writeInt32LE(h, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  let dst = 54;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      bmp[dst++] = 0;     // B
      bmp[dst++] = 0;     // G
      bmp[dst++] = 255;   // R
    }
    for (let p = 0; p < pad; p++) bmp[dst++] = 0;
  }

  console.log("[1] BMP input -> JPEG output");
  {
    const res = await post(
      { format: "jpeg", quality: "90" },
      { name: "test.bmp", type: "image/bmp", data: bmp },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    if (res.status === 200) {
      const m = await sharp(buf).metadata();
      expect(m.format === "jpeg", `output format=jpeg`);
      expect(m.width === w && m.height === h, `dims preserved ${w}x${h}`);
    }
  }

  console.log("\n[2] PNG -> DNG output");
  {
    const png = await sharp({
      create: { width: 100, height: 75, channels: 4, background: { r: 50, g: 100, b: 200, alpha: 1 } },
    }).png().toBuffer();
    const res = await post(
      { format: "dng", quality: "100" },
      { name: "test.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    if (res.status === 200) {
      // DNG = TIFF magic II*\0
      expect(buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00,
        `TIFF magic 'II*\\0'`);
      // Should contain DNGVersion tag (50706)
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const ifdOff = dv.getUint32(4, true);
      const count = dv.getUint16(ifdOff, true);
      let hasDngVersion = false;
      for (let i = 0; i < count; i++) {
        const off = ifdOff + 2 + i * 12;
        if (dv.getUint16(off, true) === 50706) hasDngVersion = true;
      }
      expect(hasDngVersion, "contains DNGVersion tag (50706)");
      expect(buf.length > 100 + 75 * 3, `byte size > raw pixel data (${buf.length})`);
    }
  }

  console.log("\n[3] PNG -> SVG output");
  {
    // Make a simple 50x50 image with two regions (good for tracing)
    const png = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
          }).png().toBuffer(),
          left: 15,
          top: 15,
        },
      ])
      .png()
      .toBuffer();
    const res = await post(
      { format: "svg" },
      { name: "test.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    if (res.status === 200) {
      const text = buf.toString("utf-8");
      expect(text.startsWith("<svg") || text.startsWith("<?xml") || text.includes("<svg"), "starts with SVG tag");
      expect(text.includes("</svg>"), "has closing svg tag");
      expect(text.includes("<path"), "has at least one <path>");
    }
  }

  console.log("\n[4] PDF output (input round-trip is intentionally not yet supported)");
  {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 200, b: 100, alpha: 1 } },
    }).png().toBuffer();
    const pdfRes = await post(
      { format: "pdf", quality: "85" },
      { name: "src.png", type: "image/png", data: png },
    );
    expect(pdfRes.status === 200, `PDF generated (status=${pdfRes.status})`);
    const pdf = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdf.slice(0, 4).toString("ascii") === "%PDF", "valid PDF magic");
    expect(pdf.length > 200, `PDF non-trivial size (${pdf.length} bytes)`);
  }

  console.log("\n[5] ICO input -> PNG output");
  {
    // Generate ICO via API, then feed back
    const png = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 50, b: 100, alpha: 1 } },
    }).png().toBuffer();
    const icoRes = await post(
      { format: "ico", quality: "100" },
      { name: "src.png", type: "image/png", data: png },
    );
    const ico = Buffer.from(await icoRes.arrayBuffer());
    expect(icoRes.status === 200, "ICO generated");
    const res = await post(
      { format: "png", quality: "100" },
      { name: "icon.ico", type: "image/x-icon", data: ico },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `ICO -> PNG status=200 (got ${res.status})`);
    if (res.status === 200) {
      expect(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, "PNG magic");
    }
  }

  console.log(`\n=== Total: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });

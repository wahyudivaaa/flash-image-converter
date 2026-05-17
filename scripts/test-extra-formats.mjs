/**
 * Smoke test BMP, ICO, PDF outputs (the 3 non-sharp encoders).
 * Run: node scripts/test-extra-formats.mjs <port>
 */
import fs from "node:fs";
import sharp from "sharp";

const port = process.argv[2] ?? "3747";
const base = `http://localhost:${port}`;
const CRLF = "\r\n";

function buildBody(file, fields) {
  const boundary = "----X" + Date.now() + Math.random().toString(36).slice(2, 8);
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
  // 200x150 RGBA test PNG
  const png = await sharp({
    create: { width: 200, height: 150, channels: 4, background: { r: 50, g: 100, b: 200, alpha: 1 } },
  }).png().toBuffer();

  console.log(`[1] PNG -> BMP`);
  {
    const res = await post({ format: "bmp", quality: "100" }, { name: "t.png", type: "image/png", data: png });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    expect(buf.slice(0, 2).toString("ascii") === "BM", `BMP magic 'BM'`);
    // BITMAPFILEHEADER fileSize at offset 2 (uint32 LE) should equal buf.length
    expect(buf.readUInt32LE(2) === buf.length, `header fileSize matches body length`);
    // pixel data offset at 10 should be 54
    expect(buf.readUInt32LE(10) === 54, `pixel data offset = 54`);
    // width at 18, height at 22
    expect(buf.readInt32LE(18) === 200 && buf.readInt32LE(22) === 150, `dimensions 200x150`);
    fs.writeFileSync(".smoke-bmp.bmp", buf);
  }

  console.log(`\n[2] PNG -> ICO`);
  {
    const res = await post({ format: "ico", quality: "100" }, { name: "t.png", type: "image/png", data: png });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    expect(buf.readUInt16LE(0) === 0, `reserved=0`);
    expect(buf.readUInt16LE(2) === 1, `type=1 (icon)`);
    const count = buf.readUInt16LE(4);
    expect(count === 6, `6 sub-images (got ${count})`);
    // First entry should be size 16 (offset=6, width at byte 0)
    const firstWidth = buf.readUInt8(6);
    expect(firstWidth === 16, `first entry width=16 (got ${firstWidth})`);
    // Last entry width should be 0 (which means 256 in ICO format)
    const lastEntryOffset = 6 + 16 * 5;
    expect(buf.readUInt8(lastEntryOffset) === 0, `last entry width=0 (=256 special)`);
    // First sub-image should be a PNG (peek at the offset)
    const firstOffset = buf.readUInt32LE(6 + 12);
    expect(buf[firstOffset] === 0x89 && buf[firstOffset + 1] === 0x50, `first sub-image is PNG`);
    fs.writeFileSync(".smoke-ico.ico", buf);
  }

  console.log(`\n[3] PNG -> PDF`);
  {
    const res = await post({ format: "pdf", quality: "85" }, { name: "t.png", type: "image/png", data: png });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);
    expect(buf.slice(0, 4).toString("ascii") === "%PDF", `PDF magic '%PDF'`);
    // PDF should end with %%EOF (with optional trailing whitespace)
    const tail = buf.slice(-32).toString("ascii");
    expect(/%%EOF/.test(tail), `ends with %%EOF`);
    expect(buf.length > 1000, `non-trivial size (${buf.length} bytes)`);
    fs.writeFileSync(".smoke-pdf.pdf", buf);
  }

  console.log(`\n[4] PNG -> ICO with resize first (256x256 source)`);
  {
    const big = await sharp({
      create: { width: 256, height: 256, channels: 4, background: { r: 200, g: 50, b: 100, alpha: 1 } },
    }).png().toBuffer();
    const res = await post({ format: "ico", quality: "100" }, { name: "big.png", type: "image/png", data: big });
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    expect(buf.readUInt16LE(2) === 1, `type=icon`);
  }

  console.log(`\n[5] BMP with resize+rotate`);
  {
    const res = await post(
      { format: "bmp", quality: "100", resizeWidth: "100", rotate: "90" },
      { name: "t.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    expect(buf.slice(0, 2).toString("ascii") === "BM", `still valid BMP`);
    // Source 200x150 rotated 90 -> 150x200, then resized width=100 inside -> 100x133 (preserving aspect)
    // BUT resize(width:100) on a 150x200 with fit:inside gives 75x100 (since width=100 is taller)
    // Actually: resize sets width=100, fit=inside, withoutEnlargement: 150x200 -> 75x100 (height-driven)
    const w = buf.readInt32LE(18);
    const h = buf.readInt32LE(22);
    expect(w <= 100 && h > 0, `dimensions transformed (got ${w}x${h})`);
  }

  // Cleanup
  for (const f of [".smoke-bmp.bmp", ".smoke-ico.ico", ".smoke-pdf.pdf"]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log(`\n=== Total: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });

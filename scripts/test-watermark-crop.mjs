/**
 * Smoke test watermark + smart crop position.
 * Run: node scripts/test-watermark-crop.mjs <port>
 */
import sharp from "sharp";

const port = process.argv[2] ?? "3748";
const base = `http://localhost:${port}`;
const CRLF = "\r\n";

function buildBody(file, fields) {
  const boundary = "----W" + Date.now() + Math.random().toString(36).slice(2, 8);
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
  // Make a 400x300 dark image (so a white watermark is visible)
  const png = await sharp({
    create: { width: 400, height: 300, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } },
  }).png().toBuffer();

  console.log(`[1] Watermark text bottom-right`);
  {
    const res = await post(
      {
        format: "png", quality: "100",
        watermarkText: "© Flash 2026",
        watermarkPosition: "br",
        watermarkOpacity: "80",
        watermarkFontSize: "5",
        watermarkColor: "#ffffff",
      },
      { name: "t.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200 (got ${res.status})`);

    // Sample bottom-right area: should have lighter pixels (watermark text)
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    // Sample at bottom-right where text should be
    let lightPixelsBR = 0;
    for (let y = 270; y < 295; y++) {
      for (let x = 200; x < 395; x++) {
        const i = (y * 400 + x) * 4;
        // Watermark white text on dark bg -> R/G/B should be > 100 somewhere
        if (data[i] > 80) lightPixelsBR++;
      }
    }
    // Top-left should still be all dark
    let lightPixelsTL = 0;
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const i = (y * 400 + x) * 4;
        if (data[i] > 80) lightPixelsTL++;
      }
    }
    expect(lightPixelsBR > 50, `watermark visible bottom-right (${lightPixelsBR} bright pixels)`);
    expect(lightPixelsTL < 5, `top-left untouched (${lightPixelsTL} bright pixels)`);
  }

  console.log(`\n[2] Watermark center, low opacity`);
  {
    const res = await post(
      {
        format: "jpeg", quality: "90",
        watermarkText: "DRAFT",
        watermarkPosition: "mc",
        watermarkOpacity: "30",
        watermarkFontSize: "10",
        watermarkColor: "#ff0000",
      },
      { name: "t.png", type: "image/png", data: png },
    );
    expect(res.status === 200, `status=200`);
  }

  console.log(`\n[3] No watermark = identical pipeline`);
  {
    const res = await post(
      { format: "png", quality: "100", watermarkText: "" },
      { name: "t.png", type: "image/png", data: png },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(res.status === 200, `status=200`);
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let lightPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 80) lightPixels++;
    }
    expect(lightPixels < 100, `no light pixels = no watermark applied (${lightPixels} bright)`);
  }

  console.log(`\n[4] Smart crop: cover with attention strategy`);
  {
    // Image with a bright spot in the right-third
    const test = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 80, channels: 4, background: { r: 255, g: 200, b: 0, alpha: 1 } },
          }).png().toBuffer(),
          left: 280,
          top: 110,
        },
      ])
      .png()
      .toBuffer();

    const res = await post(
      {
        format: "png", quality: "100",
        resizeWidth: "200", resizeHeight: "200",
        resizeFit: "cover",
        cropPosition: "attention",
      },
      { name: "t.png", type: "image/png", data: test },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect(meta.width === 200 && meta.height === 200, `crop to 200x200 (got ${meta.width}x${meta.height})`);

    // The bright yellow spot should be present in the cropped output
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let yellowPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] > 150 && data[i + 2] < 50) yellowPixels++;
    }
    expect(yellowPixels > 1000, `attention crop preserved the bright region (${yellowPixels} yellow pixels)`);
  }

  console.log(`\n[5] Position 'left' for cover crop`);
  {
    const test = await sharp({
      create: { width: 400, height: 200, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 80, channels: 4, background: { r: 0, g: 200, b: 255, alpha: 1 } },
          }).png().toBuffer(),
          left: 30,
          top: 60,
        },
      ])
      .png()
      .toBuffer();

    const res = await post(
      {
        format: "png", quality: "100",
        resizeWidth: "150", resizeHeight: "150",
        resizeFit: "cover",
        cropPosition: "left",
      },
      { name: "t.png", type: "image/png", data: test },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let cyanPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 50 && data[i + 1] > 150 && data[i + 2] > 200) cyanPixels++;
    }
    expect(cyanPixels > 1000, `left crop kept the cyan box on the left (${cyanPixels} cyan pixels)`);
  }

  console.log(`\n=== Total: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });

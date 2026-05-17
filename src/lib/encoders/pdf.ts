/**
 * PDF encoder. Wraps a single image in a US-Letter / page-sized PDF document.
 *
 * Strategy:
 *   1. Re-encode the image to JPEG (quality controllable) — pdf-lib supports
 *      embedding JPEG and PNG natively. JPEG keeps the PDF small.
 *   2. Create a page sized to the image's pixel dimensions (1 px = 1 pt @ 72dpi).
 *      That means a 4080x3060 photo becomes a 56.7" x 42.5" page — accurate
 *      for "fit to image" output. If you want it on Letter/A4, resize first.
 *   3. Embed the JPEG as the page's only content, full-bleed.
 */

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export async function encodePdf(
  input: Buffer | Uint8Array,
  quality: number,
  background: string,
): Promise<Buffer> {
  // Re-encode through sharp to JPEG. PDF readers handle JPEG well, and this
  // also flattens any transparency onto the chosen background.
  const jpegBytes = await sharp(input, { failOn: "none" })
    .flatten({ background })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  const meta = await sharp(jpegBytes).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;

  const doc = await PDFDocument.create();
  doc.setProducer("Flash Image Converter");
  doc.setCreator("Flash Image Converter");

  const jpegImg = await doc.embedJpg(jpegBytes);
  const page = doc.addPage([w, h]);
  page.drawImage(jpegImg, { x: 0, y: 0, width: w, height: h });

  const pdfBytes = await doc.save({ useObjectStreams: true });
  return Buffer.from(pdfBytes);
}

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * Stamps a discreet license footer onto every page of a PDF document.
 * Includes buyer email, order ID, and copyright notice.
 *
 * Designed as a subtle deterrent against casual file distribution.
 */
export async function stampPdf(
  inputBuffer: Uint8Array | ArrayBuffer,
  licenseText: string
): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(inputBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    if (!pages.length) throw new Error("Empty PDF");
    const fontSize = 7.5;
    const color = rgb(0.29, 0.29, 0.35); // #4a4a58 ink-soft

    for (const page of pages) {
      const { width } = page.getSize();
      const textWidth = font.widthOfTextAtSize(licenseText, fontSize);
      // Center the text in the bottom margin (14pt from page bottom)
      const size = Math.min(fontSize, fontSize * Math.max(1, width - 32) / Math.max(1, textWidth));
      const x = Math.max(16, (width - font.widthOfTextAtSize(licenseText, size)) / 2);
      const y = 14;

      page.drawText(licenseText, {
        x,
        y,
        size,
        font,
        color,
        opacity: 0.7,
      });
    }

    return await pdfDoc.save();
  } catch (err) {
    console.error("[pdf-stamp] Error stamping PDF:", err);
    throw new Error("PDF licensing failed", { cause: err });
  }
}

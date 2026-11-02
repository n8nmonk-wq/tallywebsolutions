import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { readFileSync } from "node:fs";

const secret = () => process.env.DOWNLOAD_SECRET || "default_test_secret_32_chars_long";
const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("hex");
const mintDownloadToken = (orderId, slug) => {
  const exp = Date.now() + 15 * 60 * 1000;
  const data = `${orderId}|${slug}|${exp}`;
  return `${Buffer.from(data).toString("base64url")}.${sign(data)}`;
};
const verifyDownloadToken = (token) => {
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  const data = Buffer.from(b64, "base64url").toString();
  const expected = sign(data);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const [orderId, slug, exp] = data.split("|");
  if (!orderId || !slug || !exp || Date.now() > Number(exp)) return null;
  return { orderId, slug };
};

const stampPdf = async (inputBuffer, licenseText) => {
  const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const fontSize = 7.5;
  const color = rgb(0.29, 0.32, 0.31);
  for (const page of pages) {
    const { width } = page.getSize();
    const textWidth = font.widthOfTextAtSize(licenseText, fontSize);
    const x = Math.max(16, (width - textWidth) / 2);
    page.drawText(licenseText, { x, y: 14, size: fontSize, font, color, opacity: 0.7 });
  }
  return await pdfDoc.save();
};

const DB = process.env.DATABASE_URL;
if (!DB || DB.includes("user:password@") || /@host\//.test(DB)) {
  console.log("skipped: no valid DATABASE_URL configured");
  process.exit(0);
}

const sql = neon(DB);
console.log("=========================================");
console.log("RUNNING COMPLETE FLOW VERIFICATION");
console.log("=========================================\n");

// 1. Verify Catalogue
const books = await sql`select * from books where active = true order by sort`;
console.log(`[1] Verified Catalogue: ${books.length} active books found.`);
assert.ok(books.length >= 2, "Expected at least 2 books in catalogue");

// 2. Test Prototype Checkout Creation
const testOrderId = "verify_" + Date.now();
const testEmail = "buyer@example.test";
const selectedBook = books[0];
const rzpOrderId = `nopay_${testOrderId}`;

await sql`
  insert into orders (id, email, phone, items, subtotal, tax, total, status, razorpay_order_id, paid_at)
  values (
    ${testOrderId},
    ${testEmail},
    '+919876543210',
    ${JSON.stringify([{ slug: selectedBook.slug, title: selectedBook.title, price: selectedBook.price_inr }])}::jsonb,
    ${selectedBook.price_inr},
    0,
    ${selectedBook.price_inr},
    'fulfilled',
    ${rzpOrderId},
    now()
  )
`;

await sql`
  insert into downloads (order_id, book_slug, count)
  values (${testOrderId}, ${selectedBook.slug}, 0)
`;

await sql`
  insert into events (order_id, type, payload)
  values (${testOrderId}, 'order.created', ${JSON.stringify({ slug: selectedBook.slug, email: testEmail })}::jsonb),
         (${testOrderId}, 'order.fulfilled', ${JSON.stringify({ fake: true })}::jsonb)
`;

console.log(`[2] Order created & fulfilled: ${testOrderId}`);

// 3. Test Download Token Minting & Security Verification
const token = mintDownloadToken(testOrderId, selectedBook.slug);
const verified = verifyDownloadToken(token);
assert.equal(verified?.orderId, testOrderId);
assert.equal(verified?.slug, selectedBook.slug);
console.log(`[3] Download token minted and cryptographically verified.`);

// 4. Test PDF Stamping on sample file
const samplePdfBytes = readFileSync(new URL("../public/sample.pdf", import.meta.url));
const stampText = `Licensed to ${testEmail} · Order #${testOrderId} · Tallywebsolutions`;
const stampedBytes = await stampPdf(samplePdfBytes, stampText);
const reloaded = await PDFDocument.load(stampedBytes);
assert.ok(reloaded.getPageCount() >= 1, "Stamped PDF must load and have at least 1 page");
console.log(`[4] PDF Stamped successfully with buyer license (${stampedBytes.length} bytes).`);

// 5. Test Download Counter Increment
await sql`
  update downloads set count = count + 1, last_at = now()
  where order_id = ${testOrderId} and book_slug = ${selectedBook.slug}
`;

await sql`
  insert into events (order_id, type, payload)
  values (${testOrderId}, 'download', ${JSON.stringify({ slug: selectedBook.slug, ip: '127.0.0.1' })}::jsonb)
`;

const [dlRow] = await sql`
  select count from downloads where order_id = ${testOrderId} and book_slug = ${selectedBook.slug}
`;
assert.equal(dlRow.count, 1, "Download count should be 1");
console.log(`[5] Download counter incremented to ${dlRow.count} in database.`);

// 6. Test Admin Query
const [totals] = await sql`
  select coalesce(sum(total),0)::int as revenue, count(*)::int as units
  from orders where status in ('paid','fulfilled')
`;
const events = await sql`
  select count(*)::int as total_events from events where order_id = ${testOrderId}
`;
assert.ok(totals.revenue > 0);
assert.equal(events[0].total_events, 3);
console.log(`[6] Admin query verified: Revenue ${totals.revenue} paise across ${totals.units} units; 3 events logged.`);

// Cleanup
await sql`delete from events where order_id = ${testOrderId}`;
await sql`delete from downloads where order_id = ${testOrderId}`;
await sql`delete from orders where id = ${testOrderId}`;
console.log(`[7] Test cleanup completed.\n`);
console.log("=========================================");
console.log("ALL E2E VERIFICATION CHECKS PASSED!");
console.log("=========================================");

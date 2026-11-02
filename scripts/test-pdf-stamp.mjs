/**
 * stampPdf() swallows errors and returns the ORIGINAL buffer on failure, so
 * "output is a valid PDF of >= original size" passes even when stamping did
 * nothing. The only assertion that catches that is differential: two buyers
 * must get different bytes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import { stampPdf } from "../src/lib/pdf.ts";

const sha = (b) => createHash("sha256").update(Buffer.from(b)).digest("hex");

async function run() {
  const doc = await PDFDocument.create();
  for (const n of [1, 2]) {
    doc.addPage([400, 600]).drawText(`Page ${n} Sample Content`, {
      x: 50,
      y: 500,
      size: 14,
      color: rgb(0, 0, 0),
    });
  }
  const original = await doc.save();

  const alice = await stampPdf(original, "Licensed to alice@example.com \u00B7 Order A1");
  const bob = await stampPdf(original, "Licensed to bob@example.com \u00B7 Order B2");

  // The real guarantee: the buyer's identity reaches the bytes.
  assert.notEqual(
    sha(alice),
    sha(bob),
    "different buyers must produce different files stamping silently failed"
  );
  assert.notEqual(
    sha(alice),
    sha(original),
    "stamped file must differ from the source stamping silently failed"
  );

  // Length tracks the licence text, which a returned-original never would.
  assert.ok(
    Math.abs(alice.length - bob.length) >= 1,
    "output length should track the licence text length"
  );

  // And it must still be a usable PDF with every page intact.
  const reloaded = await PDFDocument.load(alice);
  assert.equal(reloaded.getPageCount(), 2, "page count must survive stamping");

  console.log("PDF stamping test passed (differential)");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** CSV injection guard: a name starting with = must not reach Excel as a formula. */
import assert from "node:assert/strict";

function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

assert.equal(csvCell("Narendra"), '"Narendra"');
assert.equal(csvCell('He said "hi"'), '"He said ""hi"""', "quotes must be doubled");
assert.equal(csvCell("=1+1"), `"'=1+1"`, "formula must be neutralised");
assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`);
assert.equal(csvCell("-2+3"), `"'-2+3"`);
assert.equal(csvCell("+91987654321"), `"'+91987654321"`, "phone with + must be escaped");
assert.equal(csvCell(null), '""');
assert.equal(csvCell("a,b"), '"a,b"', "commas survive inside quotes");
console.log("csv checks passed");

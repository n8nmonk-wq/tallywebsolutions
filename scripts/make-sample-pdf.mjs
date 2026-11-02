/** Generates a minimal valid PDF so downloads work before the real files land. */
import { writeFileSync } from "node:fs";

const objs = [
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
  null, // stream, built below
  "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
];

const text = [
  "BT /F1 22 Tf 60 760 Td (Tallywebsolutions - placeholder) Tj ET",
  "BT /F1 12 Tf 60 730 Td (This is not the real book.) Tj ET",
  "BT /F1 12 Tf 60 712 Td (Replace books.file_url with the actual PDF.) Tj ET",
].join("\n");
objs[3] = `<</Length ${text.length}>>\nstream\n${text}\nendstream`;

let pdf = "%PDF-1.4\n";
const offsets = [];
objs.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;

writeFileSync(new URL("../public/sample.pdf", import.meta.url), pdf, "latin1");
console.log("public/sample.pdf written,", pdf.length, "bytes");

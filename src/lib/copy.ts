const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

// The governing copy rule: short headings, one-line paragraphs. Used by component tests and browser checks.
export function copyViolations(html: string, { maxHeadingWords = 6, maxParagraph = 120 } = {}) {
  const out: string[] = [];
  for (const m of html.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const t = text(m[2]);
    if (t.split(" ").filter(Boolean).length > maxHeadingWords) out.push(`heading over ${maxHeadingWords} words: "${t}"`);
  }
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const t = text(m[1]);
    if (t.length > maxParagraph) out.push(`paragraph over ${maxParagraph} characters: "${t.slice(0, 60)}..."`);
  }
  return out;
}

import type { PublicBook } from "@/components/book-data";

export type Suggestion = { books: { slug: string; title: string; authorship: string | null; cover: string | null; price: number; onSale: boolean; saleable: boolean }[];
  authors: { id: string; name: string }[]; categories: { slug: string; name: string }[] };

export function normaliseQuery(raw: string | null) {
  const q = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= 2 ? q : "";
}

// ponytail: in-memory ranking over the visible catalogue; move to SQL (pg_trgm) past a few thousand titles.
export function rankSuggestions(books: PublicBook[], categories: { slug: string; name: string }[], authors: { id: string; name: string }[], q: string): Suggestion {
  if (!q) return { books: [], authors: [], categories: [] };
  const score = (b: PublicBook) => {
    const title = b.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.split(/[^a-z0-9]+/).some((word) => word.startsWith(q))) return 1;
    if (title.includes(q)) return 2;
    if (b.authorship?.toLowerCase().includes(q) || b.isbn?.toLowerCase().includes(q)) return 3;
    return -1;
  };
  const ranked = books.map((b) => [score(b), b] as const).filter(([s]) => s >= 0).sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title)).slice(0, 6);
  return {
    books: ranked.map(([, b]) => ({ slug: b.slug, title: b.title, authorship: b.authorship, cover: b.cover, price: b.price, onSale: b.onSale, saleable: b.saleable })),
    authors: authors.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 3).map(({ id, name }) => ({ id, name })),
    categories: categories.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 3).map(({ slug, name }) => ({ slug, name })),
  };
}

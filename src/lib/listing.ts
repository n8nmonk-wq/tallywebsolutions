import type { PublicBook } from "@/components/book-data";

export type ListingParams = { q: string; category: string; author: string; language: string; format: string;
  price: "" | "0-199" | "200-499" | "500-999" | "1000+"; offer: boolean; sort: "" | "new" | "popular" | "soon" | "price-asc" | "price-desc" | "title"; page: number };
export type Facet = { key: "category" | "author" | "language" | "format" | "price" | "offer"; title: string; options: { value: string; label: string; count: number; active: boolean }[] };
type Query = Record<string, string | string[] | undefined>;
const one = (v: Query[string]) => (Array.isArray(v) ? v[0] : v) ?? "";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BANDS = { "0-199": [0, 20000], "200-499": [20000, 50000], "500-999": [50000, 100000], "1000+": [100000, Infinity] } as const;
const SORTS = ["", "new", "popular", "soon", "price-asc", "price-desc", "title"] as const;
const KEYS = ["q", "category", "author", "language", "format", "price", "offer", "sort", "page"] as const;

export function parseListing(query: Query): ListingParams {
  const text = (v: string, max = 80) => v.trim().slice(0, max);
  const page = Number(one(query.page));
  return { q: text(one(query.q), 120).toLowerCase(), category: SLUG.test(one(query.category)) ? one(query.category) : "",
    author: text(one(query.author), 120), language: text(one(query.language), 60), format: ["PDF", "EPUB"].includes(one(query.format)) ? one(query.format) : "",
    price: one(query.price) in BANDS ? one(query.price) as ListingParams["price"] : "", offer: one(query.offer) === "1",
    sort: (SORTS as readonly string[]).includes(one(query.sort)) ? one(query.sort) as ListingParams["sort"] : "",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}

type Opts = { categoryFamily?: string[]; popularity?: string[] };
const tests = (p: ListingParams, o: Opts) => ({
  q: (b: PublicBook) => !p.q || [b.title, b.subtitle, b.authorship, b.description, b.isbn].some((v) => v?.toLowerCase().includes(p.q)),
  category: (b: PublicBook) => (!o.categoryFamily || o.categoryFamily.includes(b.category_slug ?? "")) && (!p.category || b.category_slug === p.category),
  author: (b: PublicBook) => !p.author || b.author_slug === p.author,
  language: (b: PublicBook) => !p.language || b.language === p.language,
  format: (b: PublicBook) => !p.format || b.file_format === p.format,
  price: (b: PublicBook) => !p.price || (b.price >= BANDS[p.price][0] && b.price < BANDS[p.price][1]),
  offer: (b: PublicBook) => !p.offer || b.onSale || (b.offers?.length ?? 0) > 0,
});
const matching = (books: PublicBook[], p: ListingParams, o: Opts, except?: keyof ReturnType<typeof tests>) =>
  books.filter((b) => Object.entries(tests(p, o)).every(([k, t]) => k === except || t(b)));

export function filterBooks(books: PublicBook[], p: ListingParams, o: Opts = {}) {
  const out = matching(books, p, o);
  const rank = new Map((o.popularity ?? []).map((s, i) => [s, i]));
  const sorters: Record<string, (a: PublicBook, b: PublicBook) => number> = {
    "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price, title: (a, b) => a.title.localeCompare(b.title),
    new: (a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")),
    soon: (a, b) => Number(b.comingSoon) - Number(a.comingSoon) || String(a.release_date ?? "").localeCompare(String(b.release_date ?? "")),
    popular: (a, b) => (rank.get(a.slug) ?? 1e9) - (rank.get(b.slug) ?? 1e9),
  };
  return p.sort ? [...out].sort(sorters[p.sort]) : out;
}

export function facets(books: PublicBook[], p: ListingParams, categories: { slug: string; name: string }[], o: Opts = {}): Facet[] {
  const count = (key: Facet["key"], value: (b: PublicBook) => string | null | undefined, label: (v: string, b: PublicBook) => string, active: string) => {
    const map = new Map<string, { label: string; count: number }>();
    for (const b of matching(books, p, o, key as keyof ReturnType<typeof tests>)) {
      const v = value(b);
      if (v) map.set(v, { label: label(v, b), count: (map.get(v)?.count ?? 0) + 1 });
    }
    return [...map].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([v, x]) => ({ value: v, label: x.label, count: x.count, active: v === active }));
  };
  const name = new Map(categories.map((c) => [c.slug, c.name]));
  const priceOptions = (Object.keys(BANDS) as (keyof typeof BANDS)[]).map((band) => ({ value: band,
    label: band === "1000+" ? "₹1,000 and above" : `₹${band.replace("-", " to ₹")}`,
    count: matching(books, p, o, "price").filter((b) => b.price >= BANDS[band][0] && b.price < BANDS[band][1]).length, active: p.price === band })).filter((x) => x.count);
  const offers = matching(books, p, o, "offer").filter((b) => b.onSale || (b.offers?.length ?? 0) > 0).length;
  return ([
    { key: "category", title: "Category", options: count("category", (b) => b.category_slug, (v) => name.get(v) ?? v, p.category) },
    { key: "author", title: "Author", options: count("author", (b) => b.author_slug, (_v, b) => b.authorship ?? "Unknown", p.author) },
    { key: "language", title: "Language", options: count("language", (b) => b.language, (v) => v, p.language) },
    { key: "format", title: "Format", options: count("format", (b) => b.file_format, (v) => v, p.format) },
    { key: "price", title: "Price", options: priceOptions },
    { key: "offer", title: "Offers", options: offers ? [{ value: "1", label: "On offer", count: offers, active: p.offer }] : [] },
  ] as Facet[]).filter((f) => f.options.length > 0);
}

export function paginate<T>(items: T[], page: number, size = 24) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

export function listingHref(base: string, p: ListingParams, change: Partial<ListingParams>) {
  const next = { ...p, ...("page" in change ? {} : { page: 1 }), ...change };
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const v = next[key];
    if (key === "offer") { if (v) params.set("offer", "1"); }
    else if (key === "page") { if (Number(v) > 1) params.set("page", String(v)); }
    else if (v) params.set(key, String(v));
  }
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

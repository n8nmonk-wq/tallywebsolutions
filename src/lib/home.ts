import type { PublicBook } from "@/components/book-data";
import type { ContentModule } from "./content";
import type { Category } from "./store-data";
import { contentUrl, publicModules } from "@/components/content-data";

export type HomeInput = { books: PublicBook[]; categories: Category[]; modules: ContentModule[]; bestsellers: string[];
  authors: { id: string; name: string; photo_url: string | null }[]; now: Date };
export type Banner = { id: string; title: string; body: string | null; subtitle: string | null; image: string | null; mobileImage: string | null; href: string | null; label: string | null; theme: string };
export type Promo = { id: string; title: string; href: string | null; image: string | null; theme: string; size: "large" | "small"; books: PublicBook[] };
type RailKey = "bestsellers" | "new" | "offers" | "soon";
export type Home = ReturnType<typeof buildHome>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export function buildHome({ books, categories, modules, bestsellers, authors, now }: HomeInput) {
  const live = publicModules(modules, now);
  const banners: Banner[] = live.filter((m) => m.type === "banner" || m.type === "hero").map((m) => ({
    id: m.id, title: m.title, body: m.body, subtitle: str(m.payload.subtitle), image: contentUrl(m.image_url), mobileImage: contentUrl(m.mobile_image_url),
    href: contentUrl(m.link_url), label: m.link_label, theme: str(m.payload.theme) ?? "yellow" }));
  const promos: Promo[] = live.filter((m) => m.type === "promo").map((m) => {
    const size = m.payload.size === "large" ? "large" : "small";
    const category = str(m.payload.category_slug);
    return { id: m.id, title: m.title, href: contentUrl(m.link_url), image: contentUrl(m.image_url), theme: str(m.payload.theme) ?? "yellow", size,
      books: size === "large" && category ? books.filter((b) => b.category_slug === category && b.saleable).slice(0, 2) : [] };
  });
  const bySlug = new Map(books.map((b) => [b.slug, b]));
  const released = books.filter((b) => !b.comingSoon);
  const rails: { key: RailKey; title: string; tagline: string; href: string; books: PublicBook[] }[] = [
    { key: "bestsellers" as const, title: "Bestsellers", tagline: "Most bought this season", href: "/search?sort=popular",
      books: bestsellers.flatMap((slug) => bySlug.get(slug) ?? []).slice(0, 12) },
    { key: "new" as const, title: "New arrivals", tagline: "Fresh on the shelf", href: "/search?sort=new",
      books: [...released].sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")) || (b.year ?? 0) - (a.year ?? 0)).slice(0, 12) },
    { key: "offers" as const, title: "On offer", tagline: "Lower prices, for a while", href: "/search?offer=1",
      books: books.filter((b) => b.onSale && b.saleable).sort((a, b) => b.saving - a.saving).slice(0, 12) },
    { key: "soon" as const, title: "Coming soon", tagline: "Wishlist now, read first", href: "/search?sort=soon",
      books: books.filter((b) => b.comingSoon).sort((a, b) => String(a.release_date).localeCompare(String(b.release_date))).slice(0, 12) },
  ].filter((rail) => rail.books.length > 0);
  const inCategory = (slug: string) => books.filter((b) => b.category_slug === slug);
  const genreModule = live.find((m) => m.type === "genre-switcher");
  const genreSlugs = Array.isArray(genreModule?.payload.category_slugs) ? (genreModule.payload.category_slugs as string[])
    : categories.filter((c) => inCategory(c.slug).length >= 2).slice(0, 5).map((c) => c.slug);
  const genres = genreSlugs.flatMap((slug) => {
    const category = categories.find((c) => c.slug === slug);
    const items = inCategory(slug).slice(0, 12);
    return category && items.length ? [{ slug, name: category.name, books: items }] : [];
  });
  const counts = new Map<string, number>();
  for (const b of books) if (b.language) counts.set(b.language, (counts.get(b.language) ?? 0) + 1);
  const languages = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
  const categoryTiles = categories.filter((c) => inCategory(c.slug).length).slice(0, 12).map((c) => ({ slug: c.slug, name: c.name, colour: c.colour, count: inCategory(c.slug).length,
    image: contentUrl(c.image_url), covers: inCategory(c.slug).flatMap((b) => b.cover ? [b.cover] : []).slice(0, 3) }));
  const withBooks = new Set(books.map((b) => b.author_slug).filter(Boolean));
  return { banners, promos, rails, genres, languages, categoryTiles, authors: authors.filter((a) => withBooks.has(a.id)).slice(0, 10) };
}

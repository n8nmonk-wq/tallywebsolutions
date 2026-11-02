// Server-only by convention: it imports the database client. (The `server-only` package is not installed; do not add it.)
import { cartLines, loadOffers } from "./offer-data";
import { offerBadges } from "./offers";
import { sql, getBooks } from "./db";
import { publicBook, visibleBook, type PublicBook } from "@/components/book-data";

export type Category = { slug: string; name: string; parent_slug: string | null; image_url: string | null; colour: string | null; sort: number };

export async function getCategories(): Promise<Category[]> {
  return await sql`select slug,name,parent_slug,image_url,colour,sort from categories
    where status='published' order by sort, name` as Category[];
}

export async function getStoreBooks(now: Date = new Date()): Promise<PublicBook[]> {
  const [rows, offers] = await Promise.all([getBooks(), loadOffers()]);
  const visible = rows.filter(visibleBook);
  if (!offers.length) return visible.map((book) => publicBook(book, now));
  const lines = await cartLines(visible, now);
  return visible.map((book, i) => ({ ...publicBook(book, now), offers: offerBadges(lines[i], offers, now) }));
}

/** Real paid or fulfilled orders only; never a claim the data cannot support. */
export async function bestsellerSlugs(days = 90, limit = 12): Promise<string[]> {
  const rows = await sql`select item->>'slug' as slug, count(*)::int as n
    from orders, jsonb_array_elements(items) item
    where status in ('paid','fulfilled') and created_at > now() - make_interval(days => ${days})
    group by 1 order by n desc, slug limit ${limit}` as { slug: string }[];
  return rows.map((row) => row.slug);
}

export async function getPublishedAuthors() {
  return await sql`select id,name,photo_url from author_profiles
    where status='published' and (publish_at is null or publish_at <= now()) order by name` as { id: string; name: string; photo_url: string | null }[];
}

// Up to N covers per category for the header's hover panels; only titles the storefront may show.
export async function categoryCovers(perCategory = 3): Promise<Record<string, { slug: string; title: string; cover: string }[]>> {
  const rows = await sql`select category_slug, slug, title, cover from (
    select category_slug, slug, title, cover, row_number() over (partition by category_slug order by sort, title) as n from books
    where active and category_slug is not null and cover is not null
      and (not coalesce(third_party, false) or (release_approved and scan_status = 'clean' and rights_approved and commercial_approved and price_inr > 0 and file_url is not null))
  ) ranked where n <= ${perCategory}` as { category_slug: string; slug: string; title: string; cover: string }[];
  const out: Record<string, { slug: string; title: string; cover: string }[]> = {};
  for (const r of rows) (out[r.category_slug] ??= []).push({ slug: r.slug, title: r.title, cover: r.cover });
  return out;
}

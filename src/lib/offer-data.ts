import { sql, type Book } from "./db";
import { currentPrice } from "./money";
import type { CartLine, Customer, Offer } from "./offers";

// Before the admin turns offers on, these tables do not exist: everything sells at normal prices.
const missing = (error: unknown) => /relation "(?:offers|offer_redemptions|content_collections)" does not exist/.test(String((error as Error)?.message ?? error));

/** Active offers that have not ended, with their paid redemption count. */
export async function loadOffers(): Promise<Offer[]> {
  try {
    return await sql`select o.id,o.name,o.kind,o.scope,o.targets,o.value,o.cap,o.buy_qty,o.get_qty,o.get_percent,o.bundle_qty,o.bundle_price,
        o.min_items,o.min_subtotal,o.code,o.combinable,o.first_order_only,o.usage_limit,o.per_customer_limit,o.priority,o.status,
        to_json(o.starts_at)#>>'{}' as starts_at, to_json(o.ends_at)#>>'{}' as ends_at, to_json(o.created_at)#>>'{}' as created_at,
        (select count(*)::int from offer_redemptions r where r.offer_id = o.id) as uses
      from offers o where o.status = 'active' and (o.ends_at is null or o.ends_at > now())` as Offer[];
  } catch (error) { if (missing(error)) return []; throw error; }
}

/** Each book's price today plus what offers can target: its subject with ancestors, and published collections. */
export async function cartLines(books: Book[], now: Date = new Date()): Promise<CartLine[]> {
  const [categories, collections] = await Promise.all([
    (async () => await sql`select slug, parent_slug from categories` as { slug: string; parent_slug: string | null }[])(),
    (async () => {
      try { return await sql`select slug, book_slugs from content_collections where status = 'published'` as { slug: string; book_slugs: string[] }[]; }
      catch (error) { if (missing(error)) return []; throw error; }
    })(),
  ]);
  const parent = new Map(categories.map((c) => [c.slug, c.parent_slug]));
  const family = (slug: string | null | undefined) => {
    const out: string[] = [];
    for (let s = slug ?? null; s && !out.includes(s); s = parent.get(s) ?? null) out.push(s);
    return out;
  };
  return books.map((b) => {
    const p = currentPrice(b, now);
    return { slug: b.slug, price: p.price, regular: p.regular, categories: family(b.category_slug),
      collections: collections.filter((c) => Array.isArray(c.book_slugs) && c.book_slugs.includes(b.slug)).map((c) => c.slug) };
  });
}

/** Paid orders and offer uses for an email; drives first-order and per-customer limits. */
export async function customerHistory(email: string): Promise<Customer> {
  const [orders] = await sql`select count(*)::int as n from orders where lower(email) = lower(${email}) and status in ('paid','fulfilled')` as { n: number }[];
  let uses: Record<string, number> = {};
  try {
    const rows = await sql`select offer_id, count(*)::int as n from offer_redemptions where lower(email) = lower(${email}) group by offer_id` as { offer_id: string; n: number }[];
    uses = Object.fromEntries(rows.map((r) => [r.offer_id, r.n]));
  } catch (error) { if (!missing(error)) throw error; }
  return { paidOrders: orders?.n ?? 0, uses };
}

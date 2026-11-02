import { sql } from "./db";
export { parseWishlist } from "./wishlist-parse";

export const WISHLIST_MAX = 100;
const visible = (slug: string) => sql`select 1 from books where slug=${slug} and active and (not coalesce(third_party,false) or (release_approved and coalesce(rights_approved,false) and coalesce(commercial_approved,false)))`;

export async function listWishlist(readerId: string) {
  const rows = await sql`select w.book_slug from wishlist w join books b on b.slug=w.book_slug
    where w.reader_id=${readerId} and b.active and (not coalesce(b.third_party,false) or (b.release_approved and coalesce(b.rights_approved,false) and coalesce(b.commercial_approved,false)))
    order by w.created_at desc, w.book_slug limit ${WISHLIST_MAX}` as { book_slug: string }[];
  return rows.map((r) => r.book_slug);
}

export async function addWishlist(readerId: string, slug: string) {
  if (!(await visible(slug)).length) return false;
  const count = await sql`select count(*)::int n from wishlist where reader_id=${readerId}` as { n: number }[];
  if (count[0].n >= WISHLIST_MAX) return false;
  await sql`insert into wishlist(reader_id,book_slug) values(${readerId},${slug}) on conflict do nothing`;
  return true;
}

export async function removeWishlist(readerId: string, slug: string) {
  await sql`delete from wishlist where reader_id=${readerId} and book_slug=${slug}`;
}

export async function mergeWishlist(readerId: string, slugs: string[]) {
  for (const slug of slugs.slice(0, WISHLIST_MAX)) await addWishlist(readerId, slug);
  return listWishlist(readerId);
}

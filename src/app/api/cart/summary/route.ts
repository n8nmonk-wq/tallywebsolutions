import { NextResponse } from "next/server";
import { getBook, type Book } from "@/lib/db";
import { checkOrigin } from "@/lib/reader-auth";
import { publicBook, visibleBook } from "@/components/book-data";
import { priceCart } from "@/lib/offers";
import { cartLines, loadOffers } from "@/lib/offer-data";

export const runtime = "nodejs";
const SLUG = /^[a-z0-9][a-z0-9_-]{0,100}$/;

// Bag and checkout read prices from here: the same offers engine checkout charges with.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  let slugs: unknown, coupon: unknown;
  try { const text = await req.text(); if (text.length > 4000) throw new Error(); ({ slugs, coupon } = JSON.parse(text) ?? {}); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  if (!Array.isArray(slugs) || slugs.length > 20 || slugs.some((s) => typeof s !== "string" || !SLUG.test(s))) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (coupon !== undefined && coupon !== null && (typeof coupon !== "string" || coupon.length > 40)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const now = new Date();
  const rows = (await Promise.all([...new Set(slugs as string[])].map(getBook))).filter((b): b is Book => !!b && visibleBook(b));
  const books = rows.map((b) => publicBook(b, now))
    .map(({ slug, title, cover, authorship, price, regular, onSale, saleable }) => ({ slug, title, cover, authorship, price, regular, onSale, saleable }));
  const forSale = rows.filter((b) => publicBook(b, now).saleable);
  const pricing = forSale.length ? priceCart(await cartLines(forSale, now), await loadOffers(), { now, code: (coupon as string | undefined) || null, customer: null }) : null;
  return NextResponse.json({ books, pricing }, { headers: { "cache-control": "no-store" } });
}

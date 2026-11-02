import { NextResponse } from "next/server";
import { addWishlist, listWishlist, removeWishlist } from "@/lib/wishlist";
import { checkOrigin, getReader } from "@/lib/reader-auth";

export const runtime = "nodejs";
const SLUG = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function slugFrom(req: Request) {
  const text = await req.text();
  if (text.length > 1000) return null;
  try { const body = JSON.parse(text); return typeof body?.slug === "string" && SLUG.test(body.slug) ? body.slug as string : null; } catch { return null; }
}

export async function GET() {
  const reader = await getReader();
  if (!reader) return fail("Sign in to sync your wishlist.", 401);
  return NextResponse.json({ slugs: await listWishlist(reader.id) });
}

async function change(req: Request, action: "add" | "remove") {
  if (!checkOrigin(req)) return fail("Invalid origin.", 403);
  const reader = await getReader();
  if (!reader) return fail("Sign in to sync your wishlist.", 401);
  const slug = await slugFrom(req);
  if (!slug) return fail("Choose a book.", 400);
  if (action === "add") await addWishlist(reader.id, slug); else await removeWishlist(reader.id, slug);
  return NextResponse.json({ slugs: await listWishlist(reader.id) });
}
export const POST = (req: Request) => change(req, "add");
export const DELETE = (req: Request) => change(req, "remove");

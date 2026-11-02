import { NextResponse } from "next/server";
import { mergeWishlist, parseWishlist } from "@/lib/wishlist";
import { checkOrigin, getReader } from "@/lib/reader-auth";

export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const reader = await getReader();
  if (!reader) return NextResponse.json({ error: "Sign in to sync your wishlist." }, { status: 401 });
  const text = await req.text();
  if (text.length > 20000) return NextResponse.json({ error: "Too many books." }, { status: 413 });
  let slugs: string[] = [];
  try { slugs = parseWishlist(JSON.stringify(JSON.parse(text)?.slugs ?? [])); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  return NextResponse.json({ slugs: await mergeWishlist(reader.id, slugs) });
}

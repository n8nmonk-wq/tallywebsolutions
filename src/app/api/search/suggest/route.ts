import { NextResponse } from "next/server";
import { getCategories, getPublishedAuthors, getStoreBooks } from "@/lib/store-data";
import { clientKey, consumeLimit } from "@/lib/rate-limit";
import { normaliseQuery, rankSuggestions } from "@/lib/search";

export const runtime = "nodejs";
const EMPTY = { books: [], authors: [], categories: [] };

export async function GET(req: Request) {
  const q = normaliseQuery(new URL(req.url).searchParams.get("q"));
  if (!q) return NextResponse.json(EMPTY);
  try {
    if (!(await consumeLimit(clientKey(req, "suggest"), 60, 60))) return NextResponse.json({ error: "Too many searches. Try again in a minute." }, { status: 429 });
    const [books, categories, authors] = await Promise.all([getStoreBooks(), getCategories(), getPublishedAuthors()]);
    return NextResponse.json(rankSuggestions(books, categories, authors, q), { headers: { "cache-control": "private, max-age=30" } });
  } catch {
    console.error("[suggest] suggestions unavailable");
    return NextResponse.json(EMPTY, { status: 503 });
  }
}

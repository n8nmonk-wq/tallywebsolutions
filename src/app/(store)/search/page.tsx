import { getCategories, getStoreBooks, bestsellerSlugs } from "@/lib/store-data";
import { flag } from "@/lib/env";
import { parseListing } from "@/lib/listing";
import Listing from "@/components/Listing";

export const dynamic = "force-dynamic";
type Query = Record<string, string | string[] | undefined>;
export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }) {
  const p = parseListing(await searchParams);
  return { title: p.q ? `Search: ${p.q}` : "All books", robots: p.q ? { index: false } : undefined };
}

export default async function Search({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, books, categories, popularity] = await Promise.all([searchParams, getStoreBooks(), getCategories(), bestsellerSlugs(90, 200)]);
  const params = parseListing(query);
  return <Listing base="/search" title={params.q ? `Results for "${params.q}"` : params.offer ? "Offers" : "All books"} books={books} params={params}
    categories={categories} popularity={popularity} enabled={flag("COMMERCE_ENABLED")} />;
}

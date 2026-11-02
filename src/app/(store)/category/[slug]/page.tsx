import Link from "next/link";
import { flag } from "@/lib/env";
import { notFound } from "next/navigation";
import { getCategories, getStoreBooks, bestsellerSlugs } from "@/lib/store-data";
import { parseListing } from "@/lib/listing";
import { contentUrl } from "@/components/content-data";
import { siteUrl } from "@/lib/store";
import Listing from "@/components/Listing";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const category = (await getCategories()).find((c) => c.slug === slug);
  return category ? { title: `${category.name} books`, alternates: { canonical: `${siteUrl()}/category/${slug}` } } : { title: "Category not found", robots: { index: false } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query, categories, books, popularity] = await Promise.all([params, searchParams, getCategories(), getStoreBooks(), bestsellerSlugs(90, 200)]);
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  const children = categories.filter((c) => c.parent_slug === slug);
  const listing = { ...parseListing(query), category: "" };
  return <Listing base={`/category/${slug}`} title={category.name} intro={`Digital editions in ${category.name.toLowerCase()}.`} books={books} params={listing}
    banner={{ colour: category.colour, image: contentUrl(category.image_url) }} categories={categories} family={[slug, ...children.map((c) => c.slug)]}
    popularity={popularity} enabled={flag("COMMERCE_ENABLED")}>
    {children.length > 0 && <ul className="subcategory-chips">{children.map((c) => <li key={c.slug}><Link className="chip" href={`/category/${c.slug}`}>{c.name}</Link></li>)}</ul>}
  </Listing>;
}

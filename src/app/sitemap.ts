import type { MetadataRoute } from "next";

import { siteUrl } from '@/lib/store';
import { getBooks } from '@/lib/db';
import { visibleBook } from '@/components/book-data';
import { getCategories } from '@/lib/store-data';
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const books = (await getBooks()).filter(visibleBook);
  const authors = new Set(books.flatMap(book => book.author_slug ? [book.author_slug] : []));
  const paths = ["", '/search', '/publish', "/privacy", "/terms", "/refund-policy", "/delivery-policy",
    ...books.map(book => `/books/${encodeURIComponent(book.slug)}`), ...[...authors].map(id => `/authors/${encodeURIComponent(id)}`),
    ...(await getCategories()).map(c => `/category/${encodeURIComponent(c.slug)}`)];
  return paths.map((p) => ({
    url: `${siteUrl()}${p}`,
    lastModified: new Date(),
    priority: p === "" ? 1 : 0.4,
  }));
}

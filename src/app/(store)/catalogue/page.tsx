import { permanentRedirect } from "next/navigation";

export default async function Catalogue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = new URLSearchParams();
  for (const key of ["q", "language", "format", "author", "sort"]) { const v = query[key]; if (typeof v === "string" && v) next.set(key, v === "price-asc" || v === "price-desc" || v === "title" || key !== "sort" ? v : ""); }
  permanentRedirect(next.toString() ? `/search?${next}` : "/search");
}

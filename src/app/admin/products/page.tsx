import { sql, type Book } from "@/lib/db";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "@/components/AdminShell";
import { Search } from "lucide-react";
import { PRODUCT_STATUSES, productStatus, type ProductStatus } from "@/lib/admin-catalogue";
import { currentPrice } from "@/lib/money";
import ProductTable, { type ProductRow } from "./ProductTable";
import CreateProduct from "./CreateProduct";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products", robots: { index: false, follow: false } };

const PAGE = 20;

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; q?: string; status?: string; page?: string }>;
}) {
  const { notice, error, q = "", status = "", page = "1" } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");

  const needle = q.trim().toLowerCase().slice(0, 100);
  const filter = (status in PRODUCT_STATUSES ? status : "") as ProductStatus | "";
  const [rows, categories, sold] = await Promise.all([
    sql`select * from books order by sort, title`,
    sql`select slug,name from categories order by sort,name`,
    sql`select book_slug, count(*)::int as orders from downloads group by book_slug`,
  ]);
  const categoryName = new Map((categories as { slug: string; name: string }[]).map((c) => [c.slug, c.name]));
  const orders = new Map((sold as { book_slug: string; orders: number }[]).map((s) => [s.book_slug, s.orders]));

  const all = (rows as Book[]).map((b): ProductRow => {
    const price = currentPrice(b);
    return {
      slug: b.slug, title: b.title, cover: b.cover, category: categoryName.get(b.category_slug ?? "") ?? null,
      format: b.file_format ?? "PDF", price: b.price_inr, salePrice: price.onSale ? price.price : null,
      orders: orders.get(b.slug) ?? 0, status: productStatus(b), editable: !b.third_party,
    };
  });
  const counts = Object.fromEntries(Object.keys(PRODUCT_STATUSES).map((key) => [key, all.filter((r) => r.status === key).length])) as Record<ProductStatus, number>;
  const matches = all.filter((r) => (!filter || r.status === filter)
    && (!needle || [r.title, r.slug, r.category ?? ""].some((v) => v.toLowerCase().includes(needle))));

  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
  const shown = matches.slice((current - 1) * PAGE, current * PAGE);
  const href = (next: { status?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const s = next.status ?? filter;
    if (s) params.set("status", s);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const query = params.toString();
    return `/admin/products${query ? `?${query}` : ""}`;
  };

  const create = <CreateProduct />;

  return (
    <AdminShell active="books" title="Products" subtitle={`${all.length} products · ${counts["on-sale"]} on sale`} actions={create}>
      {notice && <p className="mb-4 rounded-2 border border-brand/30 bg-brand/5 px-4 py-3 text-[15px] text-brand" role="status">{notice}</p>}
      {error && <p className="mb-4 rounded-2 border border-danger/30 bg-danger/10 px-4 py-3 text-[15px] text-danger" role="alert">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <form method="get" className="flex min-w-0 flex-1 items-center gap-2" role="search">
            {filter && <input type="hidden" name="status" value={filter} />}
            <label className="sr-only" htmlFor="admin-product-search">Search products</label>
            <div className="relative min-w-0 max-w-sm flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
              <input id="admin-product-search" name="q" defaultValue={q} placeholder="Search name, slug or category" className="field-input w-full pl-9" />
            </div>
            <button className="btn btn-ghost" type="submit">Search</button>
            {(q || filter) && <a className="text-sm text-ink-soft underline" href="/admin/products">Reset</a>}
          </form>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
            {([["", "All", all.length], ...Object.entries(PRODUCT_STATUSES).map(([key, label]) => [key, label, counts[key as ProductStatus]])] as [string, string, number][])
              .filter(([key, , n]) => !key || n > 0 || key === filter).map(([key, label, n]) =>
                <a key={key || "all"} href={href({ status: key, page: 1 })} aria-current={filter === key ? "page" : undefined}
                  className={`rounded-full border px-3 py-1 text-sm ${filter === key ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:bg-bg-3 hover:text-ink"}`}>
                  {label} <span className="tabular-nums opacity-70">{n}</span></a>)}
          </nav>
        </div>

        {shown.length ? <ProductTable rows={shown} query={href({ page: current }).split("?")[1] ?? ""} />
          : <p className="p-8 text-center text-sm text-ink-soft">{all.length ? "No products match this search." : "No products yet. Use Add product to create the first one."}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-soft">
          <span>{matches.length ? `Showing ${(current - 1) * PAGE + 1}–${Math.min(current * PAGE, matches.length)} of ${matches.length}` : "Showing 0 of 0"}</span>
          {pages > 1 && <nav className="flex items-center gap-1" aria-label="Pages">
            {current > 1 && <a className="rounded-1 px-2.5 py-1 hover:bg-bg-3" href={href({ page: current - 1 })}>Previous</a>}
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
              <a key={n} href={href({ page: n })} aria-current={n === current ? "page" : undefined}
                className={`rounded-1 px-2.5 py-1 tabular-nums ${n === current ? "bg-brand text-white" : "hover:bg-bg-3"}`}>{n}</a>)}
            {current < pages && <a className="rounded-1 px-2.5 py-1 hover:bg-bg-3" href={href({ page: current + 1 })}>Next</a>}
          </nav>}
        </div>
      </div>
    </AdminShell>
  );
}

import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import BookCard from "./BookCard";
import type { PublicBook } from "./book-data";
import { facets, filterBooks, listingHref, paginate, type ListingParams } from "@/lib/listing";

const SORT_LABELS: [ListingParams["sort"], string][] = [["", "Relevance"], ["popular", "Popularity"], ["new", "Newest"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["title", "Title"]];

export default function Listing({ base, title, intro, banner, books, params, categories, children, family, popularity, enabled }: {
  base: string; title: string; intro?: string | null; banner?: { colour: string | null; image: string | null } | null; books: PublicBook[]; params: ListingParams;
  categories: { slug: string; name: string }[]; children?: React.ReactNode; family?: string[]; popularity?: string[]; enabled: boolean;
}) {
  const results = filterBooks(books, params, { categoryFamily: family, popularity });
  const page = paginate(results, params.page);
  const groups = facets(books, params, categories, { categoryFamily: family });
  const chips = groups.flatMap((g) => g.options.filter((o) => o.active).map((o) => ({ key: g.key, label: o.label })));
  if (params.q) chips.unshift({ key: "q" as never, label: `"${params.q}"` });
  return <div className="listing">
    <div className="listing-banner" style={{ ["--tile" as string]: banner?.colour ?? "var(--brand)" }}>
      <div className="wrap"><nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>
        <h1 className="enter">{title}</h1>{intro && <p>{intro}</p>}{children}</div>
      {banner?.image && <img src={banner.image} alt="" className="listing-art" />}
    </div>
    <div className="wrap listing-layout">
      <aside className="filters" aria-label="Filters">
        {/* Phones and tablets: filters fold behind one button (pure CSS); desktop always shows them. */}
        <input type="checkbox" id="filters-open" className="filters-check sr-only" />
        <label htmlFor="filters-open" className="btn btn-ghost filters-toggle"><SlidersHorizontal size={16} aria-hidden="true" />Filters{chips.length > 0 && <span className="count-badge filters-count">{chips.length}</span>}</label>
        <div className="filters-body">
        <form action={base} className="filter-search" role="search">
          {(["category", "author", "language", "format", "price", "sort"] as const).filter((k) => params[k]).map((k) => <input key={k} type="hidden" name={k} value={params[k]} />)}
          {params.offer && <input type="hidden" name="offer" value="1" />}
          <label className="field-label" htmlFor="listing-q">Search within results</label>
          <input id="listing-q" className="field-input" type="search" name="q" defaultValue={params.q} placeholder="Name or keyword" />
        </form>
        {groups.map((g) => <details key={g.key} open className="filter-group"><summary>{g.title}</summary><ul>{g.options.map((o) =>
          <li key={o.value}><Link href={listingHref(base, params, { [g.key]: o.active ? (g.key === "offer" ? false : "") : (g.key === "offer" ? true : o.value) } as Partial<ListingParams>)}
            aria-current={o.active ? "true" : undefined} className="filter-option"><span className="check" aria-hidden="true" />{o.label}<span className="count">{o.count}</span></Link></li>)}</ul></details>)}
        </div>
      </aside>
      <section className="results" aria-label="Results">
        <div className="results-bar"><p role="status">{page.total} {page.total === 1 ? "add-on" : "add-ons"}</p>
          <nav aria-label="Sort" className="sort-row"><span className="eyebrow">Sort</span>{SORT_LABELS.map(([value, label]) =>
            <Link key={value || "relevance"} className="chip" aria-current={params.sort === value ? "true" : undefined} href={listingHref(base, params, { sort: value })}>{label}</Link>)}</nav></div>
        {chips.length > 0 && <ul className="active-chips" aria-label="Active filters">{chips.map((c) =>
          <li key={c.key}><Link className="chip" href={listingHref(base, params, { [c.key]: c.key === "offer" ? false : "" } as Partial<ListingParams>)} aria-label={`Remove filter ${c.label}`}>{c.label}<X size={14} aria-hidden="true" /></Link></li>)}
          <li><Link className="clear-link" href={base}>Clear all</Link></li></ul>}
        {page.items.length ? <div className="grid-books">{page.items.map((b) => <BookCard key={b.slug} book={b} enabled={enabled} />)}</div>
          : <div className="empty-results"><h2>No add-ons match these filters</h2><p>Try fewer filters or a different search.</p><Link className="btn btn-dark" href={base}>Clear filters</Link></div>}
        {page.pages > 1 && <nav className="pager" aria-label="Pages">
          {page.page > 1 && <Link className="btn btn-outline" href={listingHref(base, params, { page: page.page - 1 })}>Previous</Link>}
          <span>Page {page.page} of {page.pages}</span>
          {page.page < page.pages && <Link className="btn btn-outline" href={listingHref(base, params, { page: page.page + 1 })}>Next</Link>}</nav>}
      </section>
    </div>
  </div>;
}

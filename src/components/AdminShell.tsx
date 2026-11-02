/**
 * TailAdmin-style chrome (fixed sidebar, stat cards, panelled tables) rendered
 * in the store's own tokens rather than importing the TailAdmin template.
 * the note in README. Client-safe: the platform layout renders it from a client component.
 */
import Link from "next/link";
import { STORE } from "@/lib/store";

export type AdminSection = "overview" | "analytics" | "orders" | "books" | "offers" | "categories" | "authors" | "collections" | "banners" | "modules" | "reviews" | "delivery";
const nav: { key: AdminSection; label: string; href: string }[] = [
  { key: "overview", label: "Dashboard", href: "/admin" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics" },
  { key: "orders", label: "Orders", href: "/admin/orders" },
  { key: "books", label: "Books", href: "/admin/books" },
  { key: "offers", label: "Offers", href: "/admin/offers" },
  { key: "categories", label: "Categories", href: "/admin/categories" },
  { key: "authors", label: "Authors", href: "/admin/platform/authors" },
  { key: "collections", label: "Collections", href: "/admin/platform/collections" },
  { key: "banners", label: "Banners", href: "/admin/banners" },
  { key: "modules", label: "Homepage sections", href: "/admin/platform/modules" },
  { key: "reviews", label: "Submissions", href: "/admin/platform/reviews" },
  { key: "delivery", label: "Delivery recovery", href: "/admin/platform/delivery" },
];


export default function AdminShell({
  active,
  title,
  subtitle,
  actions,
  children,
}: {
  active: AdminSection;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-bg-2 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="px-6 py-6">
          <p className="title text-[15px]">{STORE.name}</p>
          <p className="eyebrow mt-1">Admin</p>
        </div>

        <nav className="px-3 pb-6">
          <ul className="grid gap-1">
            {nav.map((n) => (
              <li key={n.key}>
                <Link
                  href={n.href}
                  aria-current={active === n.key ? "page" : undefined}
                  className={`block rounded-2 px-3 py-2 text-[15px] transition-colors ${
                    active === n.key
                      ? "bg-brand text-white"
                      : "text-ink-soft hover:bg-bg-3 hover:text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-line pt-2">
              <a
                href="/api/admin/export"
                className="block rounded-2 px-3 py-2 text-[15px] text-ink-soft hover:bg-bg-3 hover:text-ink"
              >
                Export orders (CSV)
              </a>
            </li>
            <li>
              <a
                href="/"
                className="block rounded-2 px-3 py-2 text-[15px] text-ink-soft hover:bg-bg-3 hover:text-ink"
              >
                View storefront
              </a>
            </li>
            <li><form action="/api/reader/sign-out" method="post"><button type="submit" className="block w-full px-3 py-2 text-left text-[15px] text-ink-soft">Sign out</button></form></li>
          </ul>
        </nav>
      </aside>

      <main className="min-w-0 px-5 py-8 lg:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="title title-lg">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[15px] text-ink-soft">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

import { STORE } from "@/lib/store";
import CartProvider from "@/components/CartProvider";
import StoreHeader from "@/components/StoreHeader";
import SiteFooter from "@/components/SiteFooter";
import CartDrawer from "@/components/CartDrawer";
import { categoryCovers, getCategories } from "@/lib/store-data";
import { getPublicContent } from "@/lib/content";
import { publicModules, contentUrl } from "@/components/content-data";
import { buildNav } from "@/lib/navigation";
import { getReader } from "@/lib/reader-auth";
import WishlistProvider from "@/components/WishlistProvider";
import Reveal from "@/components/motion/Reveal";

// A database error must never take down every page: the frame falls back to an empty menu.
async function frameData() {
  try {
    const [categories, content, previews] = await Promise.all([getCategories(), getPublicContent(), categoryCovers()]);
    const announcement = publicModules(content.modules).find((m) => m.type === "announcement") ?? null;
    return { nav: buildNav(categories), categories, previews, announcement: announcement && { title: announcement.title, link_url: contentUrl(announcement.link_url) } };
  } catch { console.error("[layout] storefront frame data unavailable"); return { nav: { primary: [], more: [] }, categories: [], previews: {}, announcement: null }; }
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [{ nav, categories, previews, announcement }, reader] = await Promise.all([frameData(), getReader().catch(() => null)]);
  return <CartProvider><WishlistProvider signedIn={!!reader}>
    <a href="#main" className="skip-link" tabIndex={0}>Skip to content</a>
    <StoreHeader name={STORE.name} nav={nav} announcement={announcement} previews={previews} />
    <main id="main" tabIndex={-1}>{children}</main>
    <CartDrawer />
    <Reveal />
    <SiteFooter name={STORE.name} categories={categories} />
  </WishlistProvider></CartProvider>;
}

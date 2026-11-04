import { getPublicContent } from "@/lib/content";
import { flag } from "@/lib/env";
import { bestsellerSlugs, getCategories, getPublishedAuthors, getStoreBooks } from "@/lib/store-data";
import { buildHome } from "@/lib/home";
import { siteUrl } from "@/lib/store";
import HeroCampaign from "@/components/home/HeroCampaign";
import CategoryTiles from "@/components/home/CategoryTiles";
import Featured from "@/components/home/Featured";
import LookInside from "@/components/home/LookInside";
import LanguageStrip from "@/components/home/LanguageStrip";
import AuthorChips from "@/components/home/AuthorChips";
import PublishBand from "@/components/home/PublishBand";
import FaqGrid from "@/components/home/FaqGrid";
import HomeSide from "@/components/home/HomeSide";
import ShopStrip from "@/components/home/ShopStrip";
import AddOnShelf from "@/components/home/AddOnShelf";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: siteUrl() } };

export default async function Home() {
  const now = new Date();
  const [books, categories, content, bestsellers, authors] = await Promise.all([getStoreBooks(now), getCategories(), getPublicContent(), bestsellerSlugs(), getPublishedAuthors()]);
  const home = buildHome({ books, categories, modules: content.modules, bestsellers, authors, now });
  const enabled = flag("COMMERCE_ENABLED");
  const covers = [...(home.rails.find((r) => r.key === "bestsellers")?.books ?? []), ...books]
    .filter((b, i, all) => b.cover && all.findIndex((x) => x.slug === b.slug) === i).slice(0, 3)
    .map(({ slug, title, cover }) => ({ slug, title, cover }));
  // The shelf shows up to ten add-ons that can be bought now: bestsellers first, then the rest.
  const shelf = [...(home.rails.find((r) => r.key === "bestsellers")?.books ?? []), ...books]
    .filter((b, i, all) => b.saleable && !b.comingSoon && all.findIndex((x) => x.slug === b.slug) === i)
    .slice(0, 10)
    .map(({ slug, title, cover, price, regular, onSale }) => ({ slug, title, cover, price, regular, onSale }));
  return <>
    <div className="wrap home-top">
      <HeroCampaign banners={home.banners} covers={covers} />
      <HomeSide books={books} />
    </div>
    <div className="wrap"><AddOnShelf items={shelf} /></div>
    <ShopStrip />
    <CategoryTiles tiles={home.categoryTiles.map(({ slug, name, count, covers: c }) => ({ slug, name, count, covers: c }))} />
    <Featured books={books} rails={home.rails} enabled={enabled} />
    <LookInside books={books} />
    <LanguageStrip languages={home.languages} />
    <AuthorChips authors={home.authors} />
    <PublishBand covers={covers} />
    <FaqGrid />
  </>;
}

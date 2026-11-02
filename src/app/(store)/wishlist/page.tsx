import { getStoreBooks } from "@/lib/store-data";
import { flag } from "@/lib/env";
import WishlistContents from "./WishlistContents";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your wishlist", robots: { index: false, follow: false } };
export default async function WishlistPage() {
  return <div className="wrap page-shell"><div className="page-heading"><h1>Your wishlist</h1><p>Saved for later.</p></div>
    <WishlistContents books={await getStoreBooks()} enabled={flag("COMMERCE_ENABLED")} /></div>;
}

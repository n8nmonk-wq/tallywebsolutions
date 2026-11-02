"use client";
import Link from "next/link";
import { Heart } from "lucide-react";
import BookCard from "@/components/BookCard";
import type { PublicBook } from "@/components/book-data";
import { useWishlist } from "@/components/WishlistProvider";

export default function WishlistContents({ books, enabled }: { books: PublicBook[]; enabled: boolean }) {
  const wishlist = useWishlist();
  if (!wishlist.ready) return <p role="status">Loading your wishlist…</p>;
  const saved = wishlist.slugs.flatMap((slug) => books.filter((b) => b.slug === slug));
  if (!saved.length) return <div className="empty-results"><Heart size={28} aria-hidden="true" /><h2>Save add-ons you love</h2><p>Tap the heart on any add-on to keep it here.</p><Link className="btn btn-dark" href="/search">Browse add-ons</Link></div>;
  return <div className="grid-books">{saved.map((b) => <BookCard key={b.slug} book={b} enabled={enabled} />)}</div>;
}

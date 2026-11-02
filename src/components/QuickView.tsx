"use client";

import Link from "next/link";
import { Eye, X } from "lucide-react";
import { useRef } from "react";
import AddToCart from "./AddToCart";
import Cover from "./Cover";
import Price from "./Price";
import WishlistButton from "./WishlistButton";
import type { PublicBook } from "./book-data";

export default function QuickView({ book, enabled }: { book: PublicBook; enabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const blurb = book.description && book.description.length > 400 ? `${book.description.slice(0, 397)}…` : book.description;
  return <>
    <button ref={trigger} type="button" className="quick-view-btn" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
      <Eye size={16} aria-hidden="true" /> Quick view</button>
    <dialog ref={dialog} className="quick-view" aria-labelledby={`qv-${book.slug}`} onClose={() => trigger.current?.focus()}
      onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
      <button type="button" className="round-btn qv-close" onClick={() => dialog.current?.close()} aria-label="Close quick view"><X size={18} aria-hidden="true" /></button>
      <div className="qv-grid"><div className="qv-cover"><Cover src={book.cover} title={book.title} sizes="260px" /></div>
        <div className="qv-info"><h2 id={`qv-${book.slug}`}>{book.title}</h2>{book.authorship && <p className="card-author">{book.authorship}</p>}
          <Price book={book} size="page" />{blurb && <p className="qv-blurb">{blurb}</p>}
          <div className="qv-actions"><AddToCart slug={book.slug} title={book.title} enabled={enabled} saleable={book.saleable} saveable={book.saveable} />
            <WishlistButton slug={book.slug} title={book.title} variant="page" /></div>
          <Link className="text-link" href={`/books/${encodeURIComponent(book.slug)}`}>View full details</Link></div></div>
    </dialog>
  </>;
}

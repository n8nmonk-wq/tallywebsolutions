"use client";
import { useState } from "react";

export default function BookPicker({ books, selected }: { books: { slug: string; title: string }[]; selected: string[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm">Books ({selected.length} selected)</legend>
    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter books" aria-label="Filter books" className="field-input mb-3" />
    <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">{books.map((book) =>
      <label key={book.slug} hidden={!!needle && !book.title.toLowerCase().includes(needle)} className="flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" name="book_slugs" value={book.slug} defaultChecked={selected.includes(book.slug)} /><span className="min-w-0 break-words">{book.title}</span></label>)}</div>
  </fieldset>;
}

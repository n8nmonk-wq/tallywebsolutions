"use client";
import { useState } from "react";

export default function BookPicker({ books, selected }: { books: { slug: string; title: string }[]; selected: string[] }) {
  const [q, setQ] = useState("");
  const [count, setCount] = useState(selected.length);
  const needle = q.trim().toLowerCase();
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm">Products ({count} selected)</legend>
    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter products" aria-label="Filter products" className="field-input mb-3" />
    <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2" onChange={(e) => {
      const box = e.target as HTMLInputElement;
      if (box.name === "book_slugs") setCount(box.closest("fieldset")!.querySelectorAll('input[name="book_slugs"]:checked').length);
    }}>{books.map((book) =>
      <label key={book.slug} hidden={!!needle && !book.title.toLowerCase().includes(needle)} className="flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" name="book_slugs" value={book.slug} defaultChecked={selected.includes(book.slug)} /><span className="min-w-0 break-words">{book.title}</span></label>)}</div>
  </fieldset>;
}

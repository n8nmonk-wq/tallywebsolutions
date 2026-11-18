"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { SLUG_MAX, slugify } from "@/lib/slug";

// "Add product": the web address fills itself in from the name. It can still be edited; once edited it stops following the name.
export default function CreateProduct() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);
  const shown = edited ? slug : slugify(title);
  return <details className="relative">
    <summary className="btn btn-primary cursor-pointer list-none"><Plus size={16} aria-hidden="true" />Add product</summary>
    <form action="/api/admin/products" method="post" className="absolute right-0 z-10 mt-2 grid w-[min(90vw,360px)] gap-3 rounded-xl border border-line bg-white p-4 shadow-lg">
      <input type="hidden" name="action" value="create" />
      <label className="text-sm">Name<input name="title" required maxLength={200} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="field-input mt-1 w-full" placeholder="Find Party Name from GSTIN" /></label>
      <label className="text-sm">Web address
        <span className="mt-1 flex items-center rounded-2 border border-line bg-bg-2 pl-3 text-sm text-ink-soft focus-within:border-brand">
          <span className="shrink-0">/products/</span>
          <input name="slug" maxLength={SLUG_MAX} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={shown}
            onChange={(e) => { setEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-/, "")); }}
            onBlur={() => setSlug((s) => slugify(s))}
            className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-3 text-ink outline-none" aria-describedby="slug-hint" />
        </span>
      </label>
      <p id="slug-hint" className="text-xs text-ink-soft">Made from the name. Edit it only if you want a different address{edited ? " · " : "."}
        {edited && <button type="button" className="underline" onClick={() => { setEdited(false); setSlug(""); }}>use the name again</button>}</p>
      <button className="btn btn-primary" type="submit" disabled={!title.trim()}>Create draft</button>
    </form>
  </details>;
}

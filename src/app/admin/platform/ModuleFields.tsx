"use client";
import { useState } from "react";

export default function ModuleFields({ section, type, payload, collections, authors, categories }: {
  section: string; type: string; payload: Record<string, unknown>;
  collections: { slug: string; title: string }[]; authors: { id: string; name: string }[]; categories: { slug: string; name: string }[];
}) {
  const [selected, setSelected] = useState(type);
  return <>
    {section === "modules" && <label className="text-sm">Module type<select name="type" className="field-input mt-1" value={selected} onChange={event => setSelected(event.target.value)}>
      {["hero", "banner", "announcement", "promo", "genre-switcher", "text", "collection", "author"].map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>}
    {["hero", "banner"].includes(selected) && <label className="text-sm">Subtitle<input name="subtitle" className="field-input mt-1" maxLength={4000} defaultValue={String(payload.subtitle ?? "")} /></label>}
    {["banner", "promo"].includes(selected) && <label className="text-sm">Colour theme<select name="theme" className="field-input mt-1" defaultValue={String(payload.theme ?? "yellow")}>
      {["yellow", "coral", "sky", "green", "ink", "lilac"].map(theme => <option key={theme} value={theme}>{theme}</option>)}</select></label>}
    {selected === "promo" && <label className="text-sm">Tile size<select name="size" className="field-input mt-1" defaultValue={String(payload.size ?? "small")}><option value="large">Large (shows live books)</option><option value="small">Small</option></select></label>}
    {selected === "promo" && <label className="text-sm">Category for live books<select name="category_slug" className="field-input mt-1" defaultValue={String(payload.category_slug ?? "")}><option value="">None</option>{categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>}
    {selected === "genre-switcher" && <fieldset className="text-sm"><legend>Categories (up to 8)</legend>{categories.map(c => <label key={c.slug} className="mr-4 inline-flex gap-2"><input type="checkbox" name="category_slugs" value={c.slug} defaultChecked={Array.isArray(payload.category_slugs) && payload.category_slugs.includes(c.slug)} />{c.name}</label>)}</fieldset>}
    {selected === "collection" && <label className="text-sm">Collection<select name="collection_slug" required className="field-input mt-1" defaultValue={String(payload.collection_slug ?? "")}><option value="">Choose collection</option>{collections.map(collection => <option key={collection.slug} value={collection.slug}>{collection.title}</option>)}</select></label>}
    {selected === "author" && <label className="text-sm">Author<select name="author_id" required className="field-input mt-1" defaultValue={String(payload.author_id ?? "")}><option value="">Choose author</option>{authors.map(author => <option key={author.id} value={author.id}>{author.name}</option>)}</select></label>}
    {selected === "testimonial" && <label className="text-sm">Attribution<input name="attribution" className="field-input mt-1" required maxLength={4000} defaultValue={String(payload.attribution ?? "")} /></label>}
    {selected === "media" && <label className="text-sm">Video URL<input name="video_url" className="field-input mt-1" maxLength={2000} defaultValue={String(payload.video_url ?? "")} /></label>}
  </>;
}

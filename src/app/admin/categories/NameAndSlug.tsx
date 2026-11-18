"use client";

import { useState } from "react";
import { slugify } from "@/lib/slug";

// Name and web address for a new category: the address follows the name until it is edited.
export default function NameAndSlug() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  return <>
    <label className="text-sm">Name<input name="name" required maxLength={80} className="field-input mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
    <label className="text-sm">Web address<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="field-input mt-1"
      value={slug ?? slugify(name).slice(0, 80)} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} onBlur={() => slug !== null && setSlug(slugify(slug).slice(0, 80))} /></label>
  </>;
}

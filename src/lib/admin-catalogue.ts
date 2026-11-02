import type { Book } from "./db";
import { PublishingError } from "@/lib/submissions";

const text = (form: FormData, name: string, max: number) => {
  const value = form.get(name);
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new PublishingError(`Invalid ${name}.`);
  return value.trim();
};
// Admin enters India time in datetime-local inputs; store it as an explicit +05:30 instant.
const istInstant = (value: string, name: string) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new PublishingError(`Invalid ${name}.`);
  return `${value}:00+05:30`;
};

export function parseSale(form: FormData, regularPaise: number) {
  const raw = text(form, "sale_price", 20);
  const starts = istInstant(text(form, "sale_starts_at", 20), "sale start");
  const ends = istInstant(text(form, "sale_ends_at", 20), "sale end");
  if (!raw) return { sale_price_inr: null, sale_starts_at: null, sale_ends_at: null };
  const paise = Math.round(Number(raw) * 100);
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(paise) || paise <= 0 || paise >= regularPaise)
    throw new PublishingError("The sale price must be above zero and below the regular price.");
  if (starts && ends && Date.parse(starts) >= Date.parse(ends)) throw new PublishingError("The sale end must be after its start.");
  return { sale_price_inr: paise, sale_starts_at: starts, sale_ends_at: ends };
}

export function parseCategory(form: FormData) {
  const slug = text(form, "slug", 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new PublishingError("Use a lowercase category slug.");
  const name = text(form, "name", 80);
  if (!name) throw new PublishingError("A category name is required.");
  const parent = text(form, "parent_slug", 80) || null;
  if (parent === slug) throw new PublishingError("A category cannot be its own parent.");
  const colour = text(form, "colour", 7) || null;
  if (colour && !/^#[0-9a-fA-F]{6}$/.test(colour)) throw new PublishingError("Use a colour like #2563EB.");
  const image = text(form, "image_url", 2000) || null;
  if (image && !(image.startsWith("/") && !image.startsWith("//")) && !image.startsWith("https://")) throw new PublishingError("Use a site path or an HTTPS image URL.");
  const sort = Number(text(form, "sort", 7) || 0);
  if (!Number.isSafeInteger(sort) || Math.abs(sort) > 100000) throw new PublishingError("Invalid sort order.");
  const status = text(form, "status", 10) || "published";
  if (!["draft", "published", "archived"].includes(status)) throw new PublishingError("Invalid status.");
  return { slug, name, parent_slug: parent, image_url: image, colour, sort, status: status as "draft" | "published" | "archived" };
}

export function releaseChecklist(book: Pick<Book, "active" | "price_inr" | "file_url" | "release_approved" | "scan_status" | "third_party" | "rights_approved" | "commercial_approved">) {
  return [
    { label: "Visible in the store", ok: book.active },
    { label: "Regular price set", ok: book.price_inr > 0 },
    { label: "Paid file attached", ok: !!book.file_url },
    { label: "File scan clean", ok: book.scan_status === "clean" },
    { label: "Released for sale", ok: book.release_approved === true },
    ...(book.third_party ? [{ label: "Rights and commercial terms approved", ok: !!book.rights_approved && !!book.commercial_approved }] : []),
  ];
}

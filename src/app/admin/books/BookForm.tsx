import type { Book } from "@/lib/db";
import { currentPrice } from "@/lib/money";
import { releaseChecklist } from "@/lib/admin-catalogue";
import { FILE_TYPE_KEYS, FILE_TYPES } from "@/lib/file-types";

const input = "field-input mt-1";
const toLocal = (value: string | null | undefined) => {
  if (!value) return "";
  const ist = new Date(new Date(value).getTime() + 330 * 60000).toISOString(); // display in India time
  return ist.slice(0, 16);
};

export default function BookForm({ book, categories, authors }: { book: Book; categories: { slug: string; name: string }[]; authors: { id: string; name: string }[] }) {
  const price = currentPrice(book);
  const field = (name: keyof Book | string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="text-sm">{label}<input name={name} className={input} defaultValue={String((book as Record<string, unknown>)[name] ?? "")} {...props} /></label>;
  return <section className="rounded-lg border border-line bg-white p-6">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-xl font-semibold">{book.title}</h2>
      <a className="text-sm underline" href={`/books/${encodeURIComponent(book.slug)}`} target="_blank" rel="noopener noreferrer">View in store</a>
    </div>
    <ul className="mb-6 flex flex-wrap gap-2" aria-label="Release checklist">{releaseChecklist(book).map((item) =>
      <li key={item.label} className={`rounded-full px-3 py-1 text-xs font-medium ${item.ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{item.ok ? "Done" : "Missing"}: {item.label}</li>)}</ul>

    <form action="/api/admin/book" method="post" className="mb-8 grid gap-4 rounded-lg bg-bg-2 p-4 sm:grid-cols-4">
      <input type="hidden" name="action" value="pricing" /><input type="hidden" name="slug" value={book.slug} />
      <p className="text-sm sm:col-span-4"><strong>Offer.</strong> Regular price ₹{(book.price_inr / 100).toFixed(2)}{price.onSale ? ` · on sale now at ₹${(price.price / 100).toFixed(2)}` : ""}. Changing the offer does not affect the release.</p>
      <label className="text-sm">Sale price (₹)<input name="sale_price" inputMode="decimal" className={input} defaultValue={book.sale_price_inr ? (book.sale_price_inr / 100).toFixed(2) : ""} /></label>
      <label className="text-sm">Starts (India time)<input name="sale_starts_at" type="datetime-local" className={input} defaultValue={toLocal(book.sale_starts_at)} /></label>
      <label className="text-sm">Ends (India time)<input name="sale_ends_at" type="datetime-local" className={input} defaultValue={toLocal(book.sale_ends_at)} /></label>
      <button className="btn btn-primary self-end" type="submit">Save offer</button>
    </form>

    <form action="/api/admin/book" method="post" className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="action" value="save" /><input type="hidden" name="slug" value={book.slug} />
      {field("title", "Title", { required: true, maxLength: 200 })}
      {field("subtitle", "Subtitle", { maxLength: 200 })}
      {field("authorship", "Author line", { maxLength: 500 })}
      <label className="text-sm">Author profile<select name="author_slug" className={input} defaultValue={book.author_slug ?? ""}><option value="">None</option>{authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="text-sm">Category<select name="category_slug" className={input} defaultValue={book.category_slug ?? ""}><option value="">None</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
      {field("language", "Language", { maxLength: 60 })}
      <label className="text-sm">Format<select name="file_format" className={input} defaultValue={book.file_format ?? "PDF"}>{FILE_TYPE_KEYS.map((key) => <option key={key} value={key.toUpperCase()}>{FILE_TYPES[key].label}</option>)}</select></label>
      {field("edition", "Edition", { maxLength: 120 })}
      {field("price_inr", "Regular price (₹)", { required: true, inputMode: "decimal", defaultValue: (book.price_inr / 100).toFixed(2) })}
      <label className="text-sm">Release date<input name="release_date" type="date" className={input} defaultValue={book.release_date ? new Date(book.release_date).toISOString().slice(0, 10) : ""} /></label>
      {field("publisher", "Publisher", { maxLength: 200 })}
      {field("isbn", "ISBN", { maxLength: 32 })}
      {field("pages", "Pages", { inputMode: "numeric" })}
      {field("year", "Year", { inputMode: "numeric" })}
      {field("cover", "Cover URL", { maxLength: 2000 })}
      <label className="text-sm sm:col-span-2">Short description<textarea name="description" rows={3} className={input} defaultValue={book.description ?? ""} /></label>
      <label className="text-sm sm:col-span-2">About the book<textarea name="long_description" rows={6} className={input} defaultValue={book.long_description ?? ""} /></label>
      <label className="text-sm">Contents and highlights (one per line)<textarea name="highlights" rows={5} className={input} defaultValue={(book.highlights || []).join("\n")} /></label>
      <label className="text-sm">Details (Key: Value per line)<textarea name="facts" rows={5} className={input} defaultValue={Object.entries(book.facts || {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k}: ${v}`).join("\n")} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={book.active} /> Visible in the store</label>
      <p className="text-sm text-ink-soft sm:col-span-2">Saving these details requires a new release before the book can be sold again (this protects buyers from silent file or price changes).</p>
      <button className="btn btn-primary justify-self-start" type="submit">Save details</button>
    </form>
  </section>;
}

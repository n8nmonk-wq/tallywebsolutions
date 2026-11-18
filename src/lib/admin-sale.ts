import { FILE_TYPES, type FileType } from "@/lib/file-types";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// The database client is passed in so this logic runs the same against Neon and the offline test database.
type Sql = (parts: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export class SaleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const MIN_BYTES = 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
// Small text add-ons are a few KB, so show KB below 1 MB rather than "0.0 MB".
const fileSize = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

// Files uploaded from admin live in private Vercel Blob storage; the checkout and download routes accept the same hosts.
export const isPrivateBlobUrl = (value: string) => {
  try { const url = new URL(value); return url.protocol === "https:" && /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname); }
  catch { return false; }
};

// What the Products screen shows before anyone clicks "Put on sale".
export async function fileCheck(root: string, fileUrl: string | null, recordedSha: string | null = null): Promise<{ ok: boolean; reason: string | null }> {
  if (!fileUrl) return { ok: false, reason: "No file attached yet. Upload the product file before putting it on sale." };
  if (isPrivateBlobUrl(fileUrl)) return /^[a-f0-9]{64}$/.test(recordedSha ?? "") ? { ok: true, reason: null } : { ok: false, reason: "The uploaded file has no checksum. Upload it again." };
  if (!fileUrl.startsWith("private:")) return { ok: false, reason: "The file is stored somewhere admin cannot check. Upload the product file here instead." };
  const file = fileUrl.slice(8);
  try {
    const { size } = await stat(path.join(root, "private", "books", file));
    return size < MIN_BYTES ? { ok: false, reason: `${file} is a ${size}-byte placeholder. Upload the real file.` } : { ok: true, reason: null };
  } catch { return { ok: false, reason: `private/books/${file} is missing. Upload the product file.` }; }
}

// First-party books go on sale from admin. For files shipped in private/books the server reads the file and records
// its checksum; uploaded files already had theirs recorded when the upload was checked.
export async function putOnSale(sql: Sql, { slug, root }: { slug: string; root: string }) {
  const rows = await sql`select slug, price_inr, file_url, file_sha256, third_party, file_format, facts->>'_file_type' as file_type from books where slug=${slug}`;
  const book = rows[0] as { price_inr: number; file_url: string | null; file_sha256: string | null; third_party: boolean | null; file_format: string | null; file_type: string | null } | undefined;
  if (!book) throw new SaleError("Product not found.", 404);
  if (!book.file_url) throw new SaleError("Upload the product file before putting it on sale.", 409);
  if (book.file_type && book.file_format && book.file_type !== book.file_format)
    throw new SaleError(`The attached file is ${book.file_type}, but the product is sold as ${book.file_format}. Upload a ${book.file_format} file or change the file type.`, 409);
  if (book.third_party) throw new SaleError("Developer submissions go on sale through their author submission review.", 409);
  if (!(book.price_inr > 0)) throw new SaleError("Set a regular price before putting the product on sale.");
  let sha: string;
  let file: string;
  if (isPrivateBlobUrl(book.file_url)) {
    if (!/^[a-f0-9]{64}$/.test(book.file_sha256 ?? "")) throw new SaleError("The uploaded file has no checksum. Upload it again.", 409);
    sha = book.file_sha256!;
    file = new URL(book.file_url).pathname.slice(1);
  } else {
    if (!book.file_url.startsWith("private:")) throw new SaleError("Upload the product file here before putting it on sale.", 409);
    file = book.file_url.slice(8);
    if (!/^[^\\/:]+$/.test(file) || file === "." || file === "..") throw new SaleError("The product's file name is invalid.");
    let bytes: Buffer;
    try { bytes = await readFile(path.join(root, "private", "books", file)); }
    catch { throw new SaleError(`private/books/${file} is missing from the deployment.`, 409); }
    if (bytes.length < MIN_BYTES) throw new SaleError(`${file} is a ${bytes.length}-byte placeholder. Upload the real file first.`, 409);
    sha = sha256(bytes);
  }
  const changed = await sql`with changed as (
    update books set file_sha256=${sha}, scan_status='clean', release_approved=true where slug=${slug} and not coalesce(third_party, false) returning slug
  ), audit as (insert into events(order_id,type,payload)
    select null,'admin.book.put_on_sale',jsonb_build_object('slug',slug,'file',${file}::text,'file_sha256',${sha}::text) from changed)
  select slug from changed`;
  if (changed.length !== 1) throw new SaleError("The product changed while saving. Reload and try again.", 409);
  return { sha };
}

// A price edit changes what is charged, not the file or rights, so the release stands.
export async function setRegularPrice(sql: Sql, { slug, rupees }: { slug: string; rupees: string }) {
  const paise = Math.round(Number(rupees) * 100);
  if (!/^\d+(?:\.\d{1,2})?$/.test(rupees) || !Number.isSafeInteger(paise) || paise <= 0 || paise > 100000000) throw new SaleError("Enter a price in rupees, like 1 or 249.50.");
  const rows = await sql`select sale_price_inr from books where slug=${slug}`;
  if (!rows.length) throw new SaleError("Product not found.", 404);
  const sale = rows[0].sale_price_inr as number | null;
  if (sale != null && sale >= paise) throw new SaleError("The regular price must stay above the sale price. Change the offer first.");
  await sql`with changed as (update books set price_inr=${paise} where slug=${slug} returning slug),
    audit as (insert into events(order_id,type,payload) select null,'admin.book.price',jsonb_build_object('slug',slug,'price_inr',${paise}::int) from changed)
    select slug from changed`;
}

// Text files may be saved as UTF-8 or, as Tally Developer often does, UTF-16 with a byte-order mark.
// UTF-16 text is full of zero bytes, so only text without a UTF-16 mark is checked for them.
const isUtf16 = (bytes: Buffer) => bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));

// Product files are checked by their bytes: PDFs by header, EPUB and ZIP by the zip header, TDL and TXT must be text.
// TCP files are compiled Tally programs (binary), so any non-empty file is accepted for them.
function checkProductFile(bytes: Buffer, type: FileType) {
  if (type === "pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new SaleError("That file is not a PDF.");
  if ((type === "epub" || type === "zip") && bytes.subarray(0, 4).toString("hex") !== "504b0304") throw new SaleError(`That file is not a ${FILE_TYPES[type].label}.`);
  if ((type === "tdl" || type === "txt") && !isUtf16(bytes) && bytes.includes(0)) throw new SaleError(`That file is not a plain-text ${FILE_TYPES[type].label}.`);
}

// Checks the uploaded bytes themselves, not the browser's claimed type.
export function validateAdminUpload(bytes: Buffer, kind: "pdf" | "cover", fileType: FileType | null = null) {
  if (!bytes.length) throw new SaleError("The upload was empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new SaleError("Files can be at most 5 MB.", 413);
  if (kind === "pdf") {
    checkProductFile(bytes, fileType ?? "pdf");
    return FILE_TYPES[fileType ?? "pdf"].contentType;
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  throw new SaleError("The cover must be a JPEG, PNG or WebP image.");
}

const firstParty = async (sql: Sql, slug: string) => {
  const rows = await sql`select third_party, file_url, cover from books where slug=${slug}`;
  if (!rows.length) throw new SaleError("Product not found.", 404);
  if (rows[0].third_party) throw new SaleError("Developer submissions change files through their submission.", 409);
  return rows[0] as { file_url: string | null; cover: string | null };
};

// A file or cover that is already attached is only changed when the admin chose "Replace", never by a stray upload.
export const ALREADY_ATTACHED = {
  pdf: "This product already has a file. Use Replace file to change it.",
  cover: "This product already has a cover. Use Replace cover to change it.",
} as const;

// The name shown in admin for the attached file: the uploaded file's own name, without any folder.
export const cleanFileName = (value: unknown) =>
  typeof value === "string" ? value.split(/[\\/]/).pop()!.replace(/[\x00-\x1f<>]/g, "").trim().slice(0, 120) : "";

// A new product file replaces the old one only when asked to, and takes the product off sale until it is put on sale again.
export async function recordBookFile(sql: Sql, { slug, url, bytes, pathname, fileType, name = "", replace = false }:
  { slug: string; url: string; bytes: Buffer; pathname: string; fileType: FileType | null; name?: string; replace?: boolean }) {
  const current = await firstParty(sql, slug);
  if (current.file_url && !replace) throw new SaleError(ALREADY_ATTACHED.pdf, 409);
  validateAdminUpload(bytes, "pdf", fileType);
  if (!isPrivateBlobUrl(url)) throw new SaleError("The upload is not in private storage.", 409);
  const sha = sha256(bytes);
  await sql`with changed as (
    update books set file_url=${url}, file_sha256=${sha}, file_format=${(fileType ?? "pdf").toUpperCase()}, file_size=${fileSize(bytes.length)},
      facts=coalesce(facts, '{}'::jsonb) || jsonb_build_object('_file_name', ${cleanFileName(name) || null}::text, '_file_type', ${(fileType ?? "pdf").toUpperCase()}::text),
      scan_status='pending', release_approved=false where slug=${slug} and not coalesce(third_party, false) returning slug
  ), audit as (insert into events(order_id,type,payload)
    select null,'admin.book.file_uploaded',jsonb_build_object('slug',slug,'pathname',${pathname}::text,'file_sha256',${sha}::text,'bytes',${bytes.length}::int) from changed)
  select slug from changed`;
  return { sha };
}

// Covers are public, but the blob store is private, so the store serves them through /api/product-cover.
export async function recordBookCover(sql: Sql, { slug, bytes, pathname, replace = false }: { slug: string; bytes: Buffer; pathname: string; replace?: boolean }) {
  const current = await firstParty(sql, slug);
  if (current.cover && !replace) throw new SaleError(ALREADY_ATTACHED.cover, 409);
  validateAdminUpload(bytes, "cover");
  const version = sha256(bytes).slice(0, 12);
  const coverPath = `/api/product-cover/${slug}/${version}`;
  await sql`with changed as (
    update books set cover=${coverPath}, facts=coalesce(facts, '{}'::jsonb) || jsonb_build_object('_cover_blob', ${pathname}::text)
    where slug=${slug} and not coalesce(third_party, false) returning slug
  ), audit as (insert into events(order_id,type,payload)
    select null,'admin.book.cover_uploaded',jsonb_build_object('slug',slug,'pathname',${pathname}::text) from changed)
  select slug from changed`;
  return { path: coverPath };
}

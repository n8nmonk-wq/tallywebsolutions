import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { sql } from "./db";

export type SubmissionStatus = "draft" | "submitted" | "in_review" | "changes_requested" | "approved" | "rejected" | "released";
export type AssetKind = "manuscript" | "cover" | "sample";
export type Asset = { id: string; kind: AssetKind; blob_url: string; sha256: string; content_type: string; size_bytes: number; scan_status: string; reviewed: boolean };
export type Submission = { id: string; author_id: string; title: string; description: string; price_inr: number; isbn: string | null; status: SubmissionStatus; review_notes: string; ownership_declared: boolean; ownership_declared_by: string | null; ownership_declared_at: string | null; rights_approved: boolean; commercial_approved: boolean; book_slug: string | null; version: number; assets: Asset[] };
export class PublishingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function nextSubmissionStatus(status: SubmissionStatus, action: string, role: "author" | "admin"): SubmissionStatus {
  if (role === "author" && action === "submit" && ["draft", "changes_requested"].includes(status)) return "submitted";
  if (role === "admin") {
    if (action === "review" && status === "submitted") return "in_review";
    if (status === "in_review") {
      if (action === "approve") return "approved";
      if (action === "request_changes") return "changes_requested";
      if (action === "reject") return "rejected";
    }
  }
  throw new PublishingError("This review transition is not allowed.", 409);
}
export function canRelease(s: Pick<Submission, "status" | "ownership_declared" | "rights_approved" | "commercial_approved"> & { assets: Pick<Asset, "kind" | "scan_status" | "reviewed">[] }) {
  return s.status === "approved" && s.ownership_declared === true && s.rights_approved === true && s.commercial_approved === true
    && s.assets.some(a => a.kind === "manuscript") && s.assets.some(a => a.kind === "cover")
    && s.assets.every(a => a.scan_status === "clean" && a.reviewed === true);
}
export function validateMetadata(input: Record<string, unknown>) {
  if (Object.keys(input).some(k => !["title", "description", "price_inr", "isbn"].includes(k))) throw new PublishingError("Only book metadata may be supplied.");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const price = Number(input.price_inr);
  if (!title || title.length > 200 || !description || description.length > 20000
    || !["string", "number"].includes(typeof input.price_inr) || String(input.price_inr).trim() === ""
    || !Number.isSafeInteger(price) || price < 0 || price > 100000000) throw new PublishingError("Enter a title, description, and valid price in paise.");
  const isbn = input.isbn == null ? "" : String(input.isbn).trim();
  if (isbn.length > 32 || (isbn && !/^[0-9Xx -]+$/.test(isbn))) throw new PublishingError("Invalid ISBN.");
  return { title, description, price_inr: price, isbn: isbn || null };
}
export function validateUploadBytes(bytes: Buffer, kind: AssetKind) {
  if (!["manuscript", "cover", "sample"].includes(kind)) throw new PublishingError("Invalid asset kind.");
  if (!bytes.length || bytes.length > (kind === "cover" ? 5 : 20) * 1024 * 1024) throw new PublishingError("File exceeds the upload limit.", 413);
  if (kind !== "cover") {
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new PublishingError("A PDF file is required.");
    return "application/pdf";
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  throw new PublishingError("Cover must be a JPEG, PNG, or WebP image.");
}
export function verifyScanSignature(body: string, timestamp: string, signature: string, secret: string, now = Date.now()) {
  if (!secret || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function readLimitedBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new PublishingError("Request too large.", 413);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new PublishingError("Request too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function readLimitedForm(req: Request, maxBytes: number) {
  const bytes = await readLimitedBody(req, maxBytes);
  try { return await new Response(bytes as BodyInit, { headers: { "Content-Type": req.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new PublishingError("Invalid form data."); }
}
export async function getAuthorSubmissions(readerId: string) {
  return await sql`select s.*, coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'scan_status',a.scan_status,'reviewed',a.reviewed,'size_bytes',a.size_bytes)) from publishing_assets a where a.submission_id=s.id),'[]'::jsonb) assets
    from publishing_submissions s join author_profiles p on p.id=s.author_id where p.reader_id=${readerId} order by s.updated_at desc` as Submission[];
}
export async function getReviewSubmissions() {
  return await sql`select s.*, p.name author_name, coalesce((select jsonb_agg(to_jsonb(a) order by a.kind) from publishing_assets a where a.submission_id=s.id),'[]'::jsonb) assets
    from publishing_submissions s join author_profiles p on p.id=s.author_id order by s.updated_at desc` as (Submission & { author_name: string })[];
}
export async function saveAuthorProfile(readerId: string, name: string, bio: string) {
  if (!name.trim() || name.length > 200 || bio.length > 10000) throw new PublishingError("Invalid author profile.");
  const id = randomUUID();
  return await sql`with changed as (
    insert into author_profiles(id,reader_id,name,bio) values(${id},${readerId},${name.trim()},${bio.trim()})
    on conflict(reader_id) do update set name=excluded.name,bio=excluded.bio,status='draft',updated_at=now() returning id
  ), audit as (insert into publishing_audit(actor_id,action,payload) select ${readerId},'author.profile.saved',jsonb_build_object('id',id) from changed)
  select id from changed`;
}
export async function createDraft(readerId: string, input: Record<string, unknown>) {
  const m = validateMetadata(input);
  const id = randomUUID();
  const rows = await sql`with changed as (
    insert into publishing_submissions(id,author_id,title,description,price_inr,isbn)
    select ${id},id,${m.title},${m.description},${m.price_inr},${m.isbn} from author_profiles where reader_id=${readerId}
    returning id
  ), audit as (insert into publishing_audit(submission_id,actor_id,action) select id,${readerId},'draft.created' from changed)
  select id from changed`;
  if (!rows.length) throw new PublishingError("Create your author profile first.", 409);
  return id;
}
export async function saveDraft(readerId: string, id: string, version: number, input: Record<string, unknown>) {
  const m = validateMetadata(input);
  const rows = await sql`with changed as (
    update publishing_submissions s set title=${m.title},description=${m.description},price_inr=${m.price_inr},isbn=${m.isbn},
      ownership_declared=false,ownership_declared_by=null,ownership_declared_at=null,
      rights_approved=false,commercial_approved=false,version=version+1,updated_at=now()
    where s.id=${id} and s.version=${version} and s.status in ('draft','changes_requested')
    and exists(select 1 from author_profiles p where p.id=s.author_id and p.reader_id=${readerId}) returning id
  ), audit as (insert into publishing_audit(submission_id,actor_id,action) select id,${readerId},'draft.saved' from changed)
  select id from changed`;
  if (!rows.length) throw new PublishingError("Draft changed or is no longer editable. Reload and try again.", 409);
}
export async function submitDraft(readerId: string, id: string, version: number, ownershipDeclared = false) {
  if (ownershipDeclared !== true) throw new PublishingError("Confirm that you own or are authorised to publish this work.");
  // The SQL predicate repeats the pure transition rule under a row lock.
  const rows = await sql`with changed as (
    update publishing_submissions s set status='submitted',ownership_declared=true,ownership_declared_by=${readerId},ownership_declared_at=now(),version=version+1,updated_at=now()
    where s.id=${id} and s.version=${version} and s.status in ('draft','changes_requested')
    and exists(select 1 from author_profiles p where p.id=s.author_id and p.reader_id=${readerId})
    and exists(select 1 from publishing_assets a where a.submission_id=s.id and a.kind='manuscript')
    and exists(select 1 from publishing_assets a where a.submission_id=s.id and a.kind='cover') returning id
  ), audit as (insert into publishing_audit(submission_id,actor_id,action,payload) select id,${readerId},'submission.submitted',jsonb_build_object('ownership_declared',true,'declaration','I own this work or am authorised to publish and distribute it.') from changed)
  select id from changed`;
  if (!rows.length) throw new PublishingError("Save the draft and upload its manuscript and cover before submitting. Reload if the draft changed.", 409);
}
export async function reviewSubmission(id: string, version: number, action: string, notes: string, rights: boolean, commercial: boolean) {
  const rows = await sql`select status from publishing_submissions where id=${id}`;
  if (!rows[0]) throw new PublishingError("Submission not found.", 404);
  const status = nextSubmissionStatus(rows[0].status, action, "admin");
  if (notes.length > 10000 || (["request_changes", "reject"].includes(action) && !notes.trim())) throw new PublishingError("Review notes are required and must be under 10,000 characters.");
  const updated = await sql`with changed as (
    update publishing_submissions set status=${status},review_notes=${notes.trim()},rights_approved=${rights},commercial_approved=${commercial},version=version+1,updated_at=now()
    where id=${id} and version=${version} and status=${rows[0].status} returning id
  ), audit as (insert into publishing_audit(submission_id,actor_id,action,payload) select id,'admin',${action},${JSON.stringify({ notes: notes.trim(), rights, commercial })}::jsonb from changed)
  select id from changed`;
  if (!updated.length) throw new PublishingError("Review changed. Reload and try again.", 409);
}
export async function releaseSubmission(id: string, version: number, slug: string) {
  return releaseReviewedSubmission(id, version, slug, null);
}
export async function releaseExistingBook(id: string, slug: string, reason: string, confirmed = false) {
  if (confirmed !== true || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 2000
    || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new PublishingError("A reviewed submission, release reason, and explicit confirmation are required.");
  return releaseReviewedSubmission(id, null, slug, reason.trim());
}
async function releaseReviewedSubmission(id: string, version: number | null, slug: string, reason: string | null) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 101) throw new PublishingError("Invalid book slug.");
  const existing = reason !== null;
  const rows = await sql`with target as (
    select slug,submission_id from books where ${existing} and slug=${slug} and not third_party for update
  ), eligible as (
    select s.*, p.name from publishing_submissions s join author_profiles p on p.id=s.author_id
    where s.id=${id} and (${existing} or s.version=${version})
    and (s.status='approved' or (${existing} and s.status='released' and s.book_slug=${slug}))
    and (not ${existing} or exists(select 1 from target where submission_id is null or submission_id=s.id))
    and s.ownership_declared and s.ownership_declared_by is not null and s.ownership_declared_at is not null and s.rights_approved and s.commercial_approved
    and exists(select 1 from publishing_assets a where a.submission_id=s.id and a.kind='manuscript' and a.content_type='application/pdf' and a.scan_status='clean' and a.reviewed)
    and exists(select 1 from publishing_assets a where a.submission_id=s.id and a.kind='cover' and a.scan_status='clean' and a.reviewed)
    and not exists(select 1 from publishing_assets a where a.submission_id=s.id and (a.scan_status<>'clean' or not a.reviewed)) for update of s
  ), book as (
    insert into books(slug,title,description,price_inr,isbn,authorship,author_slug,file_url,file_sha256,cover,sample_url,active,third_party,rights_approved,commercial_approved,release_approved,scan_status,submission_id)
    select ${slug},title,description,price_inr,isbn,name,author_id,
      (select blob_url from publishing_assets where submission_id=e.id and kind='manuscript'),
      (select sha256 from publishing_assets where submission_id=e.id and kind='manuscript' and scan_status='clean' and reviewed),
      (select '/api/submissions/assets/' || id from publishing_assets where submission_id=e.id and kind='cover'),
      (select '/api/submissions/assets/' || id from publishing_assets where submission_id=e.id and kind='sample'),
      true,true,true,true,true,'clean',id from eligible e where not ${existing} returning submission_id,file_sha256
  ), attached as (
    update books b set
      file_url=(select blob_url from publishing_assets where submission_id=e.id and kind='manuscript'),
      file_sha256=(select sha256 from publishing_assets where submission_id=e.id and kind='manuscript'),
      file_format='PDF',
      cover=(select '/api/submissions/assets/' || id from publishing_assets where submission_id=e.id and kind='cover'),
      sample_url=(select '/api/submissions/assets/' || id from publishing_assets where submission_id=e.id and kind='sample'),
      rights_approved=true,commercial_approved=true,release_approved=true,scan_status='clean',active=true,submission_id=e.id
    from eligible e where ${existing} and b.slug=${slug} and not b.third_party
    returning b.submission_id,b.file_sha256
  ), released_books as (
    select * from book union all select * from attached
  ), changed as (
    update publishing_submissions set status='released',book_slug=${slug},version=version+1,updated_at=now()
    where id in (select submission_id from released_books) returning id
  ), audit as (insert into publishing_audit(submission_id,actor_id,action,payload)
    select c.id,'admin',${existing ? 'book.released' : 'submission.released'},
      case when ${existing} then jsonb_build_object('slug',${slug}::text,'reason',${reason}::text,'file_sha256',b.file_sha256)
      else jsonb_build_object('slug',${slug}::text) end
    from changed c join released_books b on b.submission_id=c.id)
  select id from changed`;
  if (!rows.length) throw new PublishingError("Release blocked: editorial, rights, commercial, and clean reviewed assets are required.", 409);
}

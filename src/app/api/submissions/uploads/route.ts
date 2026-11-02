import { NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { get, head } from "@vercel/blob";
import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { getReader, checkOrigin } from "@/lib/reader-auth";
import { sql } from "@/lib/db";
import { validateUploadBytes, PublishingError, readLimitedBody, type AssetKind } from "@/lib/submissions";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  const reader = await getReader();
  if (!reader) return NextResponse.json({ error: "A verified author account is required." }, { status: 401 });
  try {
    const input = JSON.parse(new TextDecoder().decode(await readLimitedBody(req, 4000)));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new PublishingError("Invalid upload request.");
    if (input.action === "ticket") {
      const kind = input.kind as AssetKind;
      if (!["manuscript", "sample", "cover"].includes(kind)) throw new PublishingError("Invalid asset kind.");
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new PublishingError("Private upload storage is not configured.", 503);
      const ticketId = randomUUID();
      const pathname = `quarantine/${reader.id}/${ticketId}/${kind}`;
      const rows = await sql`with locked as (
        select s.id from publishing_submissions s join author_profiles p on p.id=s.author_id
        where s.id=${String(input.submission_id)} and p.reader_id=${reader.id} and s.status in ('draft','changes_requested') for update of s
      ) insert into publishing_upload_tickets(id,submission_id,reader_id,kind,pathname,expires_at)
        select ${ticketId},id,${reader.id},${kind},${pathname},now()+interval '30 minutes' from locked
        where (select count(*) from publishing_upload_tickets where reader_id=${reader.id} and created_at > now()-interval '1 hour') < 20 returning id`;
      if (!rows.length) throw new PublishingError("Draft is not editable or hourly upload limit reached.", 409);
      const token = await generateClientTokenFromReadWriteToken({ token: process.env.BLOB_READ_WRITE_TOKEN, pathname,
        allowedContentTypes: kind === "cover" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"],
        maximumSizeInBytes: (kind === "cover" ? 5 : 20) * 1024 * 1024,
        validUntil: Date.now() + 10 * 60 * 1000, addRandomSuffix: false, allowOverwrite: false });
      return NextResponse.json({ ticket_id: ticketId, pathname, token }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action !== "finalize") throw new PublishingError("Invalid upload action.");
    const tickets = await sql`select t.* from publishing_upload_tickets t join publishing_submissions s on s.id=t.submission_id
      where t.id=${String(input.ticket_id)} and t.reader_id=${reader.id} and t.consumed_at is null and t.expires_at>now() and s.status in ('draft','changes_requested')`;
    const ticket = tickets[0];
    if (!ticket) throw new PublishingError("Upload ticket expired or draft is not editable.", 409);
    const metadata = await head(ticket.pathname);
    const limit = (ticket.kind === "cover" ? 5 : 20) * 1024 * 1024;
    if (metadata.size <= 0 || metadata.size > limit || metadata.pathname !== ticket.pathname) throw new PublishingError("Invalid uploaded file.");
    const result = await get(ticket.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) throw new PublishingError("Uploaded file not found.", 404);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const streamReader = result.stream.getReader();
    try {
      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await streamReader.cancel(); throw new PublishingError("Uploaded file exceeds the size limit.", 413); }
        chunks.push(value);
      }
    } finally { streamReader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    const contentType = validateUploadBytes(bytes, ticket.kind);
    if (size !== metadata.size) throw new PublishingError("Upload size mismatch.");
    if (ticket.kind === "cover") {
      try {
        const image = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).metadata();
        if (!image.width || !image.height || image.width > 12000 || image.height > 12000 || !["jpeg", "png", "webp"].includes(image.format ?? "") || (image.pages ?? 1) > 1) throw new PublishingError("Invalid image dimensions or format.");
        await sharp(bytes, { limitInputPixels: 40000000 }).stats();
      } catch (error) {
        if (error instanceof PublishingError) throw error;
        throw new PublishingError("Cover image could not be decoded.");
      }
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const assetId = randomUUID();
    const rows = await sql`with locked as (
      select s.id from publishing_submissions s join author_profiles p on p.id=s.author_id
      where s.id=${ticket.submission_id} and p.reader_id=${reader.id} and s.status in ('draft','changes_requested') for update of s
    ), consumed as (
      update publishing_upload_tickets set consumed_at=now() where id=${ticket.id} and consumed_at is null and expires_at>now()
      and submission_id in (select id from locked) returning submission_id
    ), asset as (
      insert into publishing_assets(id,submission_id,kind,blob_url,sha256,content_type,size_bytes)
      select ${assetId},submission_id,${ticket.kind},${metadata.url},${hash},${contentType},${size} from consumed
      on conflict(submission_id,kind) do update set id=excluded.id,blob_url=excluded.blob_url,sha256=excluded.sha256,content_type=excluded.content_type,size_bytes=excluded.size_bytes,
        scan_status='pending',reviewed=false,scanner_reference=null,scanned_at=null,created_at=now() returning id,submission_id
    ), changed as (
      update publishing_submissions set ownership_declared=false,ownership_declared_by=null,ownership_declared_at=null,rights_approved=false,commercial_approved=false,version=version+1,updated_at=now()
      where id in (select submission_id from asset) returning id
    ), audit as (insert into publishing_audit(submission_id,actor_id,action,payload)
      select submission_id,${reader.id},'asset.quarantined',jsonb_build_object('asset_id',id,'sha256',${hash}::text) from asset)
    select id from asset`;
    if (!rows.length) throw new PublishingError("Draft changed during upload. Reload and try again.", 409);
    return NextResponse.json({ asset_id: rows[0].id, scan_status: "pending" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublishingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
    console.error("Quarantine upload failed", error);
    return NextResponse.json({ error: "Could not validate the quarantined upload. Try again later." }, { status: 503 });
  }
}

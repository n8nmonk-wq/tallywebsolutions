import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyScanSignature, readLimitedBody, PublishingError } from "@/lib/submissions";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const secret = process.env.SCAN_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Scanner attestation is not configured." }, { status: 503 });
  try {
    const body = new TextDecoder().decode(await readLimitedBody(req, 4000));
    if (!verifyScanSignature(body, req.headers.get("x-scan-timestamp") ?? "", req.headers.get("x-scan-signature") ?? "", secret)) return NextResponse.json({ error: "Invalid scanner signature." }, { status: 401 });
    const input = JSON.parse(body);
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.asset_id !== "string" || !/^[a-f0-9]{64}$/.test(input.sha256) || !["clean", "infected", "error"].includes(input.status)
      || typeof input.scanner_reference !== "string" || !input.scanner_reference.trim() || input.scanner_reference.length > 200) return NextResponse.json({ error: "Invalid scan attestation." }, { status: 400 });
    const rows = await sql`with locked as (
      select s.id from publishing_submissions s join publishing_assets a on a.submission_id=s.id
      where a.id=${input.asset_id} and a.sha256=${input.sha256} for update of s
    ), changed as (
      update publishing_assets set scan_status=${input.status},scanner_reference=${input.scanner_reference},scanned_at=now()
      where id=${input.asset_id} and sha256=${input.sha256} and scan_status='pending' and submission_id in (select id from locked) returning id,submission_id
    ), audit as (insert into publishing_audit(submission_id,actor_id,action,payload)
      select submission_id,'scanner','asset.scanned',${JSON.stringify(input)}::jsonb from changed)
    select id from changed`;
    if (!rows.length) {
      const previous = await sql`select id from publishing_assets where id=${input.asset_id} and sha256=${input.sha256} and scan_status=${input.status} and scanner_reference=${input.scanner_reference}`;
      if (!previous.length) return NextResponse.json({ error: "Asset missing, replaced, or already scanned." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PublishingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid scan payload." }, { status: 400 });
    console.error("Scan attestation failed", error);
    return NextResponse.json({ error: "Could not record scanner attestation." }, { status: 503 });
  }
}

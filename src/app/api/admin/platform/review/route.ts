import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { sql } from "@/lib/db";
import { reviewSubmission, releaseSubmission, PublishingError, readLimitedForm } from "@/lib/submissions";

export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  try {
    const form = await readLimitedForm(req, 20000);
    const id = String(form.get("id") ?? "");
    const version = Number(form.get("version"));
    if (!id || id.length > 120 || !Number.isSafeInteger(version) || version < 1) throw new PublishingError("Invalid submission version.");
    const action = String(form.get("action"));
    if (action === "release") await releaseSubmission(id, version, String(form.get("slug") ?? ""));
    else if (action === "review_asset") {
      const reviewed = form.get("reviewed") === "on";
      const rows = await sql`with locked as (
        select id from publishing_submissions where id=${id} and version=${version} and status in ('in_review','approved') for update
      ), changed as (
        update publishing_assets set reviewed=${reviewed} where id=${String(form.get("asset_id"))}
        and submission_id in (select id from locked) and scan_status='clean' returning id,submission_id
      ), versioned as (update publishing_submissions set version=version+1,updated_at=now() where id in (select submission_id from changed) returning id),
      audit as (insert into publishing_audit(submission_id,actor_id,action,payload)
        select submission_id,'admin','asset.reviewed',jsonb_build_object('asset_id',id,'reviewed',${reviewed}::boolean) from changed)
      select id from changed`;
      if (!rows.length) throw new PublishingError("Only clean assets in the current review can be accepted. Reload if the review changed.", 409);
    } else if (action === "gates") {
      const notes = String(form.get("review_notes") ?? "").trim();
      if (notes.length > 10000) throw new PublishingError("Review notes are too long.");
      const rights = form.get("rights_approved") === "on";
      const commercial = form.get("commercial_approved") === "on";
      const rows = await sql`with changed as (
        update publishing_submissions set rights_approved=${rights},commercial_approved=${commercial},review_notes=${notes},version=version+1,updated_at=now()
        where id=${id} and version=${version} and status in ('in_review','approved') returning id
      ), audit as (insert into publishing_audit(submission_id,actor_id,action,payload)
        select id,'admin','submission.gates.updated',${JSON.stringify({ rights, commercial, notes })}::jsonb from changed)
      select id from changed`;
      if (!rows.length) throw new PublishingError("Review changed or is not editable. Reload and try again.", 409);
    } else await reviewSubmission(id, version, action, String(form.get("review_notes") ?? ""), form.get("rights_approved") === "on", form.get("commercial_approved") === "on");
    revalidatePath("/");
    return NextResponse.redirect(new URL("/admin/platform/reviews?saved=1", req.url), 303);
  } catch (error) {
    if (error instanceof PublishingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Publishing review failed", error);
    return NextResponse.json({ error: "Could not save review. Check that the release slug is unused and try again." }, { status: 503 });
  }
}

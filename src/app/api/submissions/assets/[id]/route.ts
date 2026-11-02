import { get } from "@vercel/blob";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const admin = await isAdmin();
  try {
    const rows = await sql`select a.* from publishing_assets a where a.id=${id}
      and (${admin} or (a.kind in ('cover','sample') and a.scan_status='clean' and a.reviewed
        and exists(select 1 from books b where b.submission_id=a.submission_id and b.active and b.release_approved
          and b.rights_approved and b.commercial_approved and b.scan_status='clean'
          and (b.cover='/api/submissions/assets/' || a.id or b.sample_url='/api/submissions/assets/' || a.id))))`;
    const asset = rows[0];
    if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
    // Quarantined files are never served for browser review before a trusted clean scan.
    if (asset.scan_status !== "clean") return Response.json({ error: "Asset is awaiting a clean scan." }, { status: 409 });
    const result = await get(asset.blob_url, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return Response.json({ error: "Asset unavailable." }, { status: 503 });
    return new Response(result.stream, { headers: { "Content-Type": asset.content_type,
      "Content-Disposition": asset.kind === "cover" ? "inline" : 'attachment; filename="reviewed-document.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) {
    console.error("Asset read failed", error);
    return Response.json({ error: "Asset unavailable." }, { status: 503 });
  }
}

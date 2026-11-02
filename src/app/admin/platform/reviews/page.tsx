import { redirect } from "next/navigation";
import { Save, Check, Send, Search } from "lucide-react";
import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { getReviewSubmissions, canRelease, type Submission } from "@/lib/submissions";
import ActionForm from "@/components/ActionForm";

export default async function ReviewPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const submissions = await getReviewSubmissions();
  const events = await sql`select submission_id,action,actor_id,created_at from publishing_audit where submission_id is not null order by id desc limit 100`;
  return <section>
    {!submissions.length && <p className="text-sm text-ink-soft">No author submissions yet.</p>}
    {submissions.map(s => <article key={s.id} className="mb-8 border-b border-line pb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><h2 className="break-words text-xl font-medium">{s.title}</h2><p className="text-sm capitalize">{s.status.replaceAll("_", " ")}</p></div>
      <p className="mb-3 text-sm">{s.author_name} · Proposed price: {(s.price_inr / 100).toFixed(2)} INR{s.isbn ? ` · ISBN ${s.isbn}` : ""}</p>
      <p className="mb-3 text-sm">{s.ownership_declared && s.ownership_declared_at ? `Ownership declared ${new Date(s.ownership_declared_at).toISOString()}` : "Ownership declaration pending"}</p>
      <p className="mb-5 whitespace-pre-wrap break-words text-sm text-ink-soft">{s.description}</p>
      <div className="mb-5 grid gap-3">{s.assets.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <span className="capitalize">{a.kind} · {(a.size_bytes / 1024 / 1024).toFixed(1)} MB · {a.scan_status}{a.reviewed ? " · reviewed" : ""}</span>
        {a.scan_status === "clean" && <a className="underline" href={`/api/submissions/assets/${a.id}`} target="_blank" rel="noopener noreferrer">Open {a.kind}</a>}
        {a.scan_status === "clean" && ["in_review", "approved"].includes(s.status) && <ActionForm action="/api/admin/platform/review"><Identity s={s} /><input type="hidden" name="asset_id" value={a.id} /><input type="hidden" name="action" value="review_asset" /><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" name="reviewed" defaultChecked={a.reviewed} />Accept asset</label><button type="submit" className="btn btn-ghost"><Check size={16} aria-hidden />Save</button></div></ActionForm>}
      </div>)}</div>
      {s.status === "submitted" && <ActionForm action="/api/admin/platform/review"><Identity s={s} /><button name="action" value="review" className="btn btn-primary justify-self-start"><Search size={16} aria-hidden />Start review</button></ActionForm>}
      {["in_review", "approved"].includes(s.status) ? <ActionForm action="/api/admin/platform/review"><Identity s={s} />
        <label className="text-sm">Review notes<textarea name="review_notes" className="field-input mt-1" rows={3} maxLength={10000} defaultValue={s.review_notes} /></label>
        <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input name="rights_approved" type="checkbox" defaultChecked={s.rights_approved} />Rights cleared</label><label className="flex items-center gap-2"><input name="commercial_approved" type="checkbox" defaultChecked={s.commercial_approved} />Commercial terms approved</label></div>
        <div className="flex flex-wrap gap-3"><button name="action" value="gates" className="btn btn-ghost"><Save size={16} aria-hidden />Save clearance</button>
          {s.status === "in_review" && <><button name="action" value="approve" className="btn btn-primary"><Check size={16} aria-hidden />Approve editorial</button><button name="action" value="request_changes" className="btn btn-ghost">Request changes</button><button name="action" value="reject" className="btn btn-ghost">Reject</button></>}
        </div>
      </ActionForm> : s.review_notes && <p className="mb-4 whitespace-pre-wrap break-words text-sm">{s.review_notes}</p>}
      {s.status === "approved" && <ActionForm action="/api/admin/platform/review" className="mt-6"><Identity s={s} /><input type="hidden" name="action" value="release" /><label className="text-sm">Book slug<input name="slug" className="field-input mt-1" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} /></label><button className="btn btn-primary justify-self-start" disabled={!canRelease(s)}><Send size={16} aria-hidden />Release for sale</button>{!canRelease(s) && <p className="text-sm text-ink-soft">Release blocked pending ownership declaration, rights, commercial terms, and clean accepted assets.</p>}</ActionForm>}
      <details className="mt-5 text-sm"><summary className="cursor-pointer">Review history</summary><ul className="mt-2 space-y-2">{events.filter(e => e.submission_id === s.id).map((e, index) => <li key={index}>{new Date(e.created_at).toISOString()} · {e.actor_id} · {e.action}</li>)}</ul></details>
    </article>)}
  </section>;
}
function Identity({ s }: { s: Submission }) { return <><input type="hidden" name="id" value={s.id} /><input type="hidden" name="version" value={s.version} /></>; }

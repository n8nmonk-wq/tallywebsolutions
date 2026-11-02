import Link from "next/link";
import { Save, Send, Plus } from "lucide-react";
import { getReader } from "@/lib/reader-auth";
import { sql } from "@/lib/db";
import { getAuthorSubmissions } from "@/lib/submissions";
import ActionForm from "@/components/ActionForm";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Developer workspace", robots: { index: false, follow: false } };
export default async function AuthorPage() {
  const reader = await getReader();
  if (!reader) return <section className="wrap py-12"><h1 className="text-3xl font-medium">Developer workspace</h1><p className="my-5">Sign in with a verified email to register as a developer.</p><Link className="btn btn-primary" href="/login?next=/author">Sign in</Link></section>;
  const profiles = await sql`select id,name,bio from author_profiles where reader_id=${reader.id}`;
  const profile = profiles[0];
  const submissions = await getAuthorSubmissions(reader.id);
  return <section className="wrap py-10">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-medium">Developer workspace</h1><Link href="/publish" className="text-sm underline">Publishing</Link></div>
    <section className="mb-10 border-y border-line py-6">
      <h2 className="mb-4 text-xl font-medium">{profile ? "Developer profile" : "Register as a developer"}</h2>
      <ActionForm action="/api/submissions" className="max-w-2xl">
        <input type="hidden" name="action" value="profile" />
        <label>Name<input className="field-input mt-1" name="name" defaultValue={profile?.name ?? reader.name} required maxLength={200} /></label>
        <label>Biography<textarea className="field-input mt-1" name="bio" defaultValue={profile?.bio ?? ""} maxLength={10000} rows={3} /></label>
        <button className="btn btn-primary justify-self-start" type="submit"><Save size={16} aria-hidden />{profile ? "Save profile" : "Register"}</button>
      </ActionForm>
    </section>
    {profile && <>
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-medium">New submission</h2>
        <ActionForm action="/api/submissions" className="max-w-3xl">
          <input type="hidden" name="action" value="create" />
          <BookFields />
          <button type="submit" className="btn btn-primary justify-self-start"><Plus size={16} aria-hidden />Create draft</button>
        </ActionForm>
      </section>
      <section><h2 className="mb-4 text-xl font-medium">Your submissions</h2>
        {!submissions.length && <p className="text-ink-soft">No submissions yet.</p>}
        {submissions.map(s => {
          const editable = s.status === "draft" || s.status === "changes_requested";
          return <article key={s.id} className="mb-6 border-t border-line py-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="break-words text-xl font-medium">{s.title}</h3><span className="text-sm capitalize">{s.status.replaceAll("_", " ")}</span></div>
            {s.review_notes && <div className="mb-5 border-l-2 border-brand pl-4"><h4 className="text-sm font-medium">Review notes</h4><p className="whitespace-pre-wrap break-words text-sm">{s.review_notes}</p></div>}
            {editable ? <>
              <ActionForm action="/api/submissions"><input type="hidden" name="action" value="save" /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="version" value={s.version} /><BookFields book={s} /><button type="submit" className="btn btn-ghost justify-self-start"><Save size={16} aria-hidden />Save draft</button></ActionForm>
              <UploadForm submissionId={s.id} />
            </> : <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{s.description}</p>}
            <ul className="my-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">{s.assets.map(a => <li key={a.id} className="capitalize">{a.kind}: {a.scan_status}{a.reviewed ? ", reviewed" : ""}</li>)}</ul>
            {editable && <ActionForm action="/api/submissions"><input type="hidden" name="action" value="submit" /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="version" value={s.version} /><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="ownership_declared" required />I own this work or am authorised to publish and distribute it.</label><button type="submit" className="btn btn-primary justify-self-start" disabled={!s.assets.some(a => a.kind === "manuscript") || !s.assets.some(a => a.kind === "cover")}><Send size={16} aria-hidden />Submit for review</button></ActionForm>}
            {s.book_slug && <Link className="text-sm underline" href={`/#${s.book_slug}`}>View released title</Link>}
          </article>;
        })}
      </section>
    </>}
  </section>;
}
function BookFields({ book }: { book?: { title: string; description: string; price_inr: number; isbn: string | null } }) {
  return <>
    <label>Title<input name="title" className="field-input mt-1" required maxLength={200} defaultValue={book?.title} /></label>
    <label>Description<textarea name="description" className="field-input mt-1" required maxLength={20000} rows={4} defaultValue={book?.description} /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label>Proposed price (paise)<input type="number" name="price_inr" className="field-input mt-1" required min={0} max={100000000} step={1} defaultValue={book?.price_inr ?? 0} /></label><label>ISBN<input name="isbn" className="field-input mt-1" maxLength={32} defaultValue={book?.isbn ?? ""} /></label></div>
  </>;
}

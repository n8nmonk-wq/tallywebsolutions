import { NextResponse } from "next/server";
import { getReader, checkOrigin } from "@/lib/reader-auth";
import { createDraft, saveDraft, submitDraft, saveAuthorProfile, PublishingError, readLimitedForm } from "@/lib/submissions";

export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  const reader = await getReader();
  if (!reader) return NextResponse.json({ error: "Sign in with a verified email." }, { status: 401 });
  try {
    const form = await readLimitedForm(req, 50000);
    const action = String(form.get("action") ?? "");
    const id = String(form.get("id") ?? "");
    const version = Number(form.get("version"));
    if (action === "profile") await saveAuthorProfile(reader.id, String(form.get("name") ?? ""), String(form.get("bio") ?? ""));
    else if (action === "submit") await submitDraft(reader.id, id, version, form.get("ownership_declared") === "on");
    else if (action === "create" || action === "save") {
      const allowed = new Set(["action", "id", "version", "title", "description", "price_inr", "isbn"]);
      for (const key of form.keys()) if (!allowed.has(key)) throw new PublishingError("Unexpected metadata field.");
      const input = { title: form.get("title"), description: form.get("description"), price_inr: form.get("price_inr"), isbn: form.get("isbn") };
      if (action === "create") await createDraft(reader.id, input);
      else await saveDraft(reader.id, id, version, input);
    } else throw new PublishingError("Invalid author action.");
    return NextResponse.redirect(new URL("/author?saved=1", req.url), 303);
  } catch (error) {
    if (error instanceof PublishingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Author submission failed", error);
    return NextResponse.json({ error: "Could not save the submission. Try again later." }, { status: 503 });
  }
}

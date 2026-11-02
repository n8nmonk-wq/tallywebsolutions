import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { contentSections, saveContent, deleteContent, moveModule, ContentError, type ContentSection } from "@/lib/content";

// Screens that may ask to be sent back after a save; anything else returns to the generic CMS page.
const RETURN_PATHS = new Set(["/admin/banners"]);
import { readLimitedForm, PublishingError } from "@/lib/submissions";

export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Origin rejected." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  let back: string | null = null;
  try {
    const form = await readLimitedForm(req, 60000);
    back = RETURN_PATHS.has(String(form.get("return_to") ?? "")) ? String(form.get("return_to")) : null;
    const section = String(form.get("section")) as ContentSection;
    if (!contentSections.includes(section)) return NextResponse.json({ error: "Unknown CMS section." }, { status: 400 });
    const id = String(form.get("id") ?? "");
    const expected = String(form.get("updated_at") ?? "");
    const action = form.get("action");
    if (action === "delete") await deleteContent(section, id, expected);
    else if (action === "move") await moveModule(id, String(form.get("direction") ?? ""));
    else if (action === "save") {
      const input: Record<string, unknown> = Object.fromEntries(form.entries());
      // datetime-local inputs carry no zone; the admin enters India time.
      for (const key of ["publish_at", "ends_at"]) {
        const value = String(input[key] ?? "");
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) input[key] = `${value}:00+05:30`;
      }
      input.book_slugs = form.getAll("book_slugs");
      input.payload = form.has("payload") ? JSON.parse(String(form.get("payload") || "{}")) : Object.fromEntries(
        ["subtitle", "attribution", "collection_slug", "author_id", "video_url", "theme", "size", "category_slug"].filter(key => form.get(key)).map(key => [key, form.get(key)])
      );
      if (form.getAll("category_slugs").length) (input.payload as Record<string, unknown>).category_slugs = form.getAll("category_slugs").map(String);
      await saveContent(section, id, expected || null, input);
    } else return NextResponse.json({ error: "Unknown content action." }, { status: 400 });
    revalidatePath("/");
    revalidatePath("/admin/platform");
    return NextResponse.redirect(new URL(back ? `${back}?saved=1` : `/admin/platform/${section}?saved=1`, req.url), 303);
  } catch (error) {
    if (back && (error instanceof ContentError || error instanceof PublishingError)) return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(error.message)}`, req.url), 303);
    if (error instanceof PublishingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid module data JSON." }, { status: 400 });
    // Validation errors carry no database or provider details.
    if (error instanceof ContentError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("CMS update failed", error);
    return NextResponse.json({ error: "Could not save content. Reload and try again." }, { status: 503 });
  }
}

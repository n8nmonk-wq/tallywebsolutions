import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { PublishingError, readLimitedForm } from "@/lib/submissions";
import { parseCategory } from "@/lib/admin-catalogue";

export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const form = await readLimitedForm(req, 20000);
    const c = parseCategory(form);
    // "Add category" never overwrites an existing one with the same web address.
    if (form.get("mode") === "create" && (await sql`select 1 from categories where slug=${c.slug}`).length) throw new PublishingError("A category with that web address already exists. Edit it below, or choose another address.", 409);
    if (c.parent_slug && !(await sql`select 1 from categories where slug=${c.parent_slug}`).length) throw new PublishingError("Choose an existing parent category.");
    await sql`with saved as (
      insert into categories(slug,name,parent_slug,image_url,colour,sort,status) values(${c.slug},${c.name},${c.parent_slug},${c.image_url},${c.colour},${c.sort},${c.status})
      on conflict (slug) do update set name=excluded.name,parent_slug=excluded.parent_slug,image_url=excluded.image_url,colour=excluded.colour,sort=excluded.sort,status=excluded.status,updated_at=now()
      returning slug
    ), audit as (insert into events(order_id,type,payload) select null,'admin.category.saved',jsonb_build_object('slug',slug) from saved)
    select slug from saved`;
    revalidatePath("/"); revalidatePath("/admin/categories");
    return NextResponse.redirect(new URL("/admin/categories?saved=1", req.url), 303);
  } catch (error) {
    // Browser form posts go back to Categories with the message; API callers keep JSON.
    const html = req.headers.get("accept")?.includes("text/html");
    if (error instanceof PublishingError) return html ? NextResponse.redirect(new URL(`/admin/categories?error=${encodeURIComponent(error.message)}`, req.url), 303) : NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Category save failed");
    if (html) return NextResponse.redirect(new URL(`/admin/categories?error=${encodeURIComponent("Could not save the category. Try again.")}`, req.url), 303);
    return NextResponse.json({ error: "Could not save the category." }, { status: 503 });
  }
}

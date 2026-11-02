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
    const c = parseCategory(await readLimitedForm(req, 20000));
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
    if (error instanceof PublishingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Category save failed");
    return NextResponse.json({ error: "Could not save the category." }, { status: 503 });
  }
}

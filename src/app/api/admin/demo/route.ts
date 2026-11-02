import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedForm } from "@/lib/submissions";
import { loadDemo, removeDemo } from "@/lib/demo-store";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fills the storefront with clearly fictional demo titles for previews, or removes them again.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const action = (await readLimitedForm(req, 2000)).get("action");
    if (action === "load") await loadDemo();
    else if (action === "remove") await removeDemo();
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    revalidatePath("/", "layout");
    return NextResponse.redirect(new URL(`/admin?demo=${action === "load" ? "loaded" : "removed"}`, req.url), 303);
  } catch {
    console.error("[admin demo] failed");
    return NextResponse.redirect(new URL("/admin?demo=failed", req.url), 303);
  }
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedForm } from "@/lib/submissions";
import { OfferError, duplicateOffer, parseOffer, saveOffer, setOfferStatus, setupOffers } from "@/lib/offer-admin";

export const runtime = "nodejs";
const back = (req: Request, query: string) => NextResponse.redirect(new URL(`/admin/offers?${query}`, req.url), 303);

export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const form = await readLimitedForm(req, 40000);
    const action = String(form.get("action") ?? ""), id = String(form.get("id") ?? "");
    if (action === "setup") await setupOffers(await readFile(path.join(process.cwd(), "migrations/008-offers.sql"), "utf8"));
    else if (action === "save") await saveOffer(parseOffer(form));
    else if (action === "duplicate" && id) await duplicateOffer(id);
    else if ((action === "pause" || action === "resume" || action === "archive") && id)
      await setOfferStatus(id, action === "pause" ? "paused" : action === "resume" ? "active" : "archived");
    else return back(req, "error=" + encodeURIComponent("Unknown action."));
    // Offers change prices on every listing and product page.
    revalidatePath("/", "layout");
    return back(req, "saved=1");
  } catch (error) {
    if (error instanceof OfferError) return back(req, "error=" + encodeURIComponent(error.message));
    console.error("[admin offers] failed");
    return back(req, "error=" + encodeURIComponent("Could not save. Try again."));
  }
}

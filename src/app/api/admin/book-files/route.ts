import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { get, head } from "@vercel/blob";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedBody } from "@/lib/submissions";
import { MAX_UPLOAD_BYTES, SaleError, recordBookCover, recordBookFile } from "@/lib/admin-sale";

export const runtime = "nodejs";
export const maxDuration = 60;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reply = (error: string, status: number) => NextResponse.json({ error }, { status });

// Admin book files go browser -> private Blob directly (no 4.5 MB function body limit); "finalize" re-reads and checks them.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return reply("Origin rejected.", 403);
  if (!(await isAdmin())) return reply("Admin sign-in required.", 401);
  try {
    const input = JSON.parse(new TextDecoder().decode(await readLimitedBody(req, 4000)));
    const slug = String(input?.slug ?? "");
    const kind = input?.kind;
    if (!SLUG.test(slug) || slug.length > 101 || (kind !== "pdf" && kind !== "cover")) return reply("Invalid upload request.", 400);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return reply("File storage is not set up yet. Connect a private Vercel Blob store to this project.", 503);
    if (input.action === "ticket") {
      const book = await sql`select third_party from books where slug=${slug}`;
      if (!book.length) return reply("Book not found.", 404);
      if (book[0].third_party) return reply("Author books change files through their author submission.", 409);
      const pathname = `admin/books/${slug}/${randomUUID()}-${kind}`;
      const clientToken = await generateClientTokenFromReadWriteToken({ token, pathname,
        allowedContentTypes: kind === "cover" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"],
        maximumSizeInBytes: MAX_UPLOAD_BYTES, validUntil: Date.now() + 10 * 60 * 1000, addRandomSuffix: false, allowOverwrite: false });
      return NextResponse.json({ pathname, token: clientToken }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action !== "finalize") return reply("Invalid upload action.", 400);
    const pathname = String(input.pathname ?? "");
    if (!new RegExp(`^admin/books/${slug}/[0-9a-f-]{36}-${kind}$`).test(pathname)) return reply("Invalid upload path.", 400);
    const metadata = await head(pathname);
    if (metadata.size <= 0 || metadata.size > MAX_UPLOAD_BYTES) return reply("Files can be at most 5 MB.", 413);
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return reply("Uploaded file not found.", 404);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const stream = result.stream.getReader();
    try {
      for (;;) {
        const { done, value } = await stream.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_UPLOAD_BYTES) { await stream.cancel(); return reply("Files can be at most 5 MB.", 413); }
        chunks.push(value);
      }
    } finally { stream.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (kind === "pdf") await recordBookFile(sql, { slug, url: metadata.url, bytes, pathname });
    else {
      try {
        const image = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).metadata();
        if (!image.width || !image.height || image.width > 12000 || image.height > 12000) throw new SaleError("The cover image size is not supported.");
      } catch (error) { throw error instanceof SaleError ? error : new SaleError("The cover image could not be read."); }
      await recordBookCover(sql, { slug, bytes, pathname });
    }
    for (const path of ["/", "/admin/books", `/books/${slug}`, "/search"]) revalidatePath(path);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SaleError) return reply(error.message, error.status);
    if (error instanceof SyntaxError) return reply("Invalid upload request.", 400);
    console.error("[admin upload] failed");
    return reply("The upload could not be saved. Try again.", 503);
  }
}

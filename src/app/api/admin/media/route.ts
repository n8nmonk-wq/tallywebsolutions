import { NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { del, get, head } from "@vercel/blob";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from "@/lib/reader-auth";
import { readLimitedBody } from "@/lib/submissions";
import { MAX_UPLOAD_BYTES, SaleError, validateAdminUpload } from "@/lib/admin-sale";
import { MEDIA_KEY, MEDIA_PREFIX, MEDIA_TYPES, mediaUrl } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 60;

const reply = (error: string, status: number) => NextResponse.json({ error }, { status });

// Admin image uploads go browser -> private Blob ("ticket"), then "finalize" checks the bytes are a real image
// before /api/media serves it; anything that is not a real image is deleted.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return reply("Origin rejected.", 403);
  if (!(await isAdmin())) return reply("Admin sign-in required.", 401);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return reply("File storage is not set up yet. Connect a private Vercel Blob store to this project.", 503);
  try {
    const input = JSON.parse(new TextDecoder().decode(await readLimitedBody(req, 2000)));
    if (input?.action === "ticket") {
      const pathname = `${MEDIA_PREFIX}${randomUUID()}`;
      const clientToken = await generateClientTokenFromReadWriteToken({ token, pathname, allowedContentTypes: MEDIA_TYPES,
        maximumSizeInBytes: MAX_UPLOAD_BYTES, validUntil: Date.now() + 10 * 60 * 1000, addRandomSuffix: false, allowOverwrite: false });
      return NextResponse.json({ pathname, token: clientToken }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input?.action !== "finalize") return reply("Invalid upload action.", 400);
    const incoming = String(input.pathname ?? "");
    const key = incoming.slice(MEDIA_PREFIX.length);
    if (!incoming.startsWith(MEDIA_PREFIX) || !MEDIA_KEY.test(key)) return reply("Invalid upload path.", 400);
    const meta = await head(incoming);
    if (meta.size <= 0 || meta.size > MAX_UPLOAD_BYTES) return reply("Images can be at most 5 MB.", 413);
    const result = await get(incoming, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return reply("Uploaded image not found.", 404);
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    try {
      validateAdminUpload(bytes, "cover"); // JPEG, PNG or WebP by its bytes, not the browser's claim
      const image = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).metadata();
      if (!image.width || !image.height || image.width > 12000 || image.height > 12000) throw new SaleError("That image size is not supported.");
    } catch (error) {
      await del(incoming, { token }).catch(() => {});
      throw error instanceof SaleError ? error : new SaleError("That image could not be read.");
    }
    return NextResponse.json({ url: mediaUrl(key) });
  } catch (error) {
    if (error instanceof SaleError) return reply(error.message, error.status);
    if (error instanceof SyntaxError) return reply("Invalid upload request.", 400);
    console.error("[admin media] failed");
    return reply("The image could not be saved. Try again.", 503);
  }
}

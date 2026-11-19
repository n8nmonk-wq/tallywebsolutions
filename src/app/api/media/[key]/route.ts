import { get } from "@vercel/blob";
import { MEDIA_KEY, MEDIA_PREFIX } from "@/lib/media";

export const runtime = "nodejs";

// Serves admin-uploaded images. Only content-hashed keys under admin/media/ exist here, so they are cached for good.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!MEDIA_KEY.test(key) || !process.env.BLOB_READ_WRITE_TOKEN) return new Response("Not found", { status: 404 });
  const result = await get(`${MEDIA_PREFIX}${key}`, { access: "private" }).catch(() => null);
  if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(result.stream, { headers: {
    "Content-Type": result.blob.contentType || "image/jpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } });
}

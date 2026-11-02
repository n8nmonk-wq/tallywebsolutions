import { get } from "@vercel/blob";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// Serves covers uploaded from admin. The URL carries a content version, so it can be cached for good.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug, version } = await params;
  if (!/^[a-z0-9-]{1,101}$/.test(slug) || !/^[a-f0-9]{12}$/.test(version)) return new Response("Not found", { status: 404 });
  const rows = await sql`select facts->>'_cover_blob' as pathname from books where slug=${slug} and cover=${`/api/book-cover/${slug}/${version}`}` as { pathname: string | null }[];
  const pathname = rows[0]?.pathname;
  if (!pathname || !process.env.BLOB_READ_WRITE_TOKEN) return new Response("Not found", { status: 404 });
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(result.stream, { headers: {
    "Content-Type": result.blob.contentType || "image/jpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } });
}

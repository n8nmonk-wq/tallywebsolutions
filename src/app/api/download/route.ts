import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { get } from "@vercel/blob";
import { sql, getOrder } from "@/lib/db";
import { verifyDownloadToken, licenceId } from "@/lib/token";
import { canAccessOrder } from "@/lib/reader-auth";
import { stampPdf } from "@/lib/pdf";
import { env } from "@/lib/env";

export const runtime = "nodejs";
const MAX_DOWNLOADS = 10;
const MAX_BYTES = 64 * 1024 * 1024;
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  try {
    const claim = verifyDownloadToken(new URL(req.url).searchParams.get("t") || "");
    if (!claim) return reply("This link has expired. Reopen your order page for a fresh one.", 403);
    const order = await getOrder(claim.orderId);
    if (!order || !await canAccessOrder(order)) return reply("Order access denied.", 403);
    if (order.status !== "paid" && order.status !== "fulfilled") return reply("Order is not available.", 403);
    const item = order.items.find(i => i.slug === claim.slug);
    if (!item) return reply("Not part of this order.", 403);
    const access = await sql`select 1 from downloads where order_id=${order.id} and book_slug=${claim.slug}
      and revoked_at is null and count>=0 and count<${MAX_DOWNLOADS}`;
    if (!access.length) return reply('Download entitlement is unavailable or its limit was reached.', 429);
    // Older orders without a snapshot require an explicit migration, never today's catalogue file.
    if (!item.file_url) return reply("Purchased file snapshot is unavailable. Please contact support.", 503);
    if (typeof item.file_sha256 !== "string" || item.file_sha256.length !== 64 || !/^[a-f0-9]{64}$/i.test(item.file_sha256))
      return reply("Purchased file integrity snapshot is unavailable. Please contact support.", 503);
    const format = (item.file_format || "").toLowerCase();
    if (format !== "pdf" && format !== "epub") return reply("Unsupported purchased file format.", 503);
    let bytes: Uint8Array;
    if (item.file_url.startsWith("private:")) {
      const name = item.file_url.slice(8);
      if (!name || name !== path.basename(name) || /[\\/:\x00]/.test(name)) return reply("Invalid file reference.", 503);
      const dir = await realpath(path.join(process.cwd(), "private", "books"));
      const full = await realpath(path.join(dir, name));
      if (!full.startsWith(dir + path.sep)) return reply("Invalid file reference.", 503);
      bytes = await readFile(full);
      if (bytes.length > MAX_BYTES) return reply("Purchased file exceeds supported size.", 503);
    } else {
      const url = new URL(item.file_url);
      const allowed = (process.env.BOOK_STORAGE_ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const privateBlob = /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname);
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          (!privateBlob && !allowed.includes(url.hostname.toLowerCase())) ||
          (privateBlob && !env("BLOB_READ_WRITE_TOKEN")))
        return reply("File storage is not approved.", 503);
      let stream: ReadableStream<Uint8Array>;
      if (privateBlob) {
        const result = await get(url.href, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(30000) });
        if (!result || result.statusCode !== 200 || result.blob.size > MAX_BYTES) return reply("Could not fetch the file.", 502);
        stream = result.stream;
      } else {
        const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
        if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > MAX_BYTES)
          return reply("Could not fetch the file.", 502);
        stream = response.body;
      }
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.length;
          if (length > MAX_BYTES) throw new Error("File too large");
          chunks.push(next.value);
        }
      } finally { await reader.cancel(); }
      bytes = Buffer.concat(chunks, length);
    }
    if (!bytes.length) return reply("Purchased file is empty.", 503);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== item.file_sha256.toLowerCase())
      return reply("Purchased file integrity verification failed. Please contact support.", 503);
    if (format === "pdf") bytes = await stampPdf(bytes, `Personal licence ${licenceId(order.id, claim.slug)}`);
    // Serialize against refunds on the order row and consume only an existing, active entitlement.
    const reserved = await sql`
      with eligible as (
        select id from orders where id = ${order.id} and status in ('paid','fulfilled') for update
      )
      update downloads d set count = d.count + 1, last_at = now()
      where d.order_id in (select id from eligible) and d.book_slug = ${claim.slug}
        and d.revoked_at is null and d.count >= 0 and d.count < ${MAX_DOWNLOADS}
      returning d.count
    ` as { count: number }[];
    if (!reserved.length) return reply("Download entitlement is unavailable or its limit was reached.", 429);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": format === "epub" ? "application/epub+zip" : "application/pdf",
        "content-disposition": `attachment; filename="${claim.slug}.${format}"`,
        "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error('[download] delivery failed');
    try { await sql`insert into events(type,payload) values('download.failed','{}'::jsonb)`; } catch {}
    return reply("Could not prepare your licensed file. Please retry.", 503);
  }
}

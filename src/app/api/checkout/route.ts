import { normaliseFileType } from "@/lib/file-types";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sql, getBook, type Book, type Order } from "@/lib/db";
import { computeTotals } from "@/lib/money";
import { checkoutConfiguration, createPaymentLink, PaymentLinkCreationRejected } from "@/lib/razorpay";
import { fulfilOrder } from "@/lib/fulfil";
import { isSaleable } from "@/lib/catalogue";
import { canAccessOrder, getReader, grantGuestOrder, checkOrigin } from "@/lib/reader-auth";
import { validateEmail, validatePhone, validateName } from "@/lib/validate";
import { env } from "@/lib/env";
import { readLimitedBody, PublishingError } from "@/lib/submissions";
import { normaliseCode, priceCart } from "@/lib/offers";
import { cartLines, customerHistory, loadOffers } from "@/lib/offer-data";

export const runtime = "nodejs";
type CheckoutOrder = Order & { checkout_hash: string; payment_url: string | null; is_dev: boolean };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  let configuration: ReturnType<typeof checkoutConfiguration>;
  try { configuration = checkoutConfiguration(); } catch { return reply("Checkout is not available.", 503); }
  if (!checkOrigin(req)) return reply("Invalid origin.", 403);
  let body: Record<string, unknown>;
  try {
    const raw = new TextDecoder().decode(await readLimitedBody(req, 16384));
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return reply("Bad request.", 400);
    body = value;
  } catch (error) {
    if (error instanceof PublishingError && error.status === 413) return reply("Request too large.", 413);
    return reply("Bad request.", 400);
  }
  const headerKey = req.headers.get("idempotency-key");
  const bodyKey = body.idempotencyKey;
  if (headerKey && bodyKey && headerKey !== bodyKey) return reply("Conflicting idempotency keys.", 400);
  const key = headerKey || bodyKey;
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return reply("A valid idempotency key is required.", 400);
  const slugs = body.slugs === undefined ? [body.slug] : body.slugs;
  if (!Array.isArray(slugs) || slugs.length < 1 || slugs.length > 20 ||
      slugs.some(s => typeof s !== "string" || !/^[a-z0-9][a-z0-9_-]{0,100}$/.test(s)) ||
      new Set(slugs).size !== slugs.length || (body.slugs !== undefined && body.slug !== undefined))
    return reply("Choose between one and twenty distinct books.", 400);
  if (typeof body.name !== "string" || typeof body.email !== "string" || typeof body.phone !== "string" ||
      body.email.length > 254 || body.phone.length > 32) return reply("Invalid customer details.", 400);
  if ((body.coupon !== undefined && (typeof body.coupon !== "string" || body.coupon.length > 40)) ||
      (body.expectedTotal !== undefined && !Number.isSafeInteger(body.expectedTotal))) return reply("Bad request.", 400);
  const coupon = typeof body.coupon === "string" ? normaliseCode(body.coupon) : "";
  try {
    const reader = await getReader();
    const nameCheck = validateName(body.name);
    const emailCheck = validateEmail(reader?.email || body.email);
    const phoneCheck = validatePhone(body.phone);
    if (!nameCheck.ok) return reply(nameCheck.error, 400);
    if (!emailCheck.ok) return reply(emailCheck.error, 400);
    if (!phoneCheck.ok) return reply(phoneCheck.error, 400);
    const name = nameCheck.value, email = emailCheck.value, phone = phoneCheck.value;
    const hash = crypto.createHash("sha256").update(JSON.stringify({ slugs: [...slugs].sort(), name, email, phone, reader: reader?.id || null, ...(coupon ? { coupon } : {}),
      // The shown total is part of the request: a reused key with a new total never gets the old payment link.
      ...(body.expectedTotal !== undefined ? { total: body.expectedTotal } : {}) })).digest("hex");
    const respond = async (order: CheckoutOrder) => {
      if (order.checkout_hash !== hash) return reply("Idempotency key was already used for a different checkout.", 409);
      if (!await canAccessOrder(order)) return reply("Order access denied.", 403);
      if (order.status === "refunded") return reply("This order was refunded.", 409);
      if (order.is_dev) {
        if (!configuration.dev) return reply("Development order unavailable.", 403);
        await fulfilOrder(`nopay_${order.id}`, null);
        return NextResponse.json({ orderId: order.id, noPayment: true });
      }
      if (order.payment_url) return NextResponse.json({ orderId: order.id, paymentUrl: order.payment_url });
      const id = order.id;
      const claimed = await sql`
        insert into payment_attempts (order_id,state)
        select id,'creating' from orders where id = ${id} and status = 'created'
          and razorpay_order_id is null and razorpay_link_id is null and payment_url is null
        on conflict (order_id) do update set state = 'creating', attempts = payment_attempts.attempts + 1, updated_at = now()
          where payment_attempts.state = 'retryable' and payment_attempts.attempts < 3
        returning order_id
      ` as { order_id: string }[];
      if (!claimed.length) {
        const exhausted = await sql`select 1 from payment_attempts where order_id = ${id} and state = 'failed' and attempts >= 3`;
        if (exhausted.length) return reply("Payment setup could not be completed. Please contact support.", 503);
        return NextResponse.json({ orderId: id, pending: true }, { status: 202 });
      }
      try {
        const link = await createPaymentLink({
          amountPaise: order.total, orderId: id, name: order.name || name, email: order.email, phone: order.phone || phone,
          description: order.items.map(i => i.title).join(", ").slice(0, 200),
          callbackUrl: `${configuration.site}/order/${id}`,
        });
        await sql`
          with attached as (
            update orders set razorpay_order_id = ${link.id}, razorpay_link_id = ${link.id}, payment_url = ${link.short_url}
            where id = ${id} and razorpay_order_id is null returning id
          )
          update payment_attempts set state = 'ready', updated_at = now()
          where order_id in (select id from attached)
        `;
        return NextResponse.json({ orderId: id, paymentUrl: link.short_url });
      } catch (error) {
        await sql`update payment_attempts set state = ${error instanceof PaymentLinkCreationRejected ? 'failed' : 'unknown'}, updated_at = now() where order_id = ${id} and state = 'creating'`;
        console.error("[checkout] provider creation needs reconciliation");
        return NextResponse.json({ orderId: id, pending: true, error: "Payment setup is pending verification." }, { status: 202 });
      }
    };
    const existing = await sql`select * from orders where checkout_key = ${key}` as CheckoutOrder[];
    if (existing.length) return await respond(existing[0]);
    // shortcut: email cap can be bypassed by address rotation; add shared abuse controls if needed.
    const recent = await sql`select count(*)::int as n from orders where email = ${email} and created_at > now() - interval '1 hour'` as { n: number }[];
    if ((recent[0]?.n || 0) >= 10) return reply("Too many attempts. Please try again later.", 429);
    const books = await Promise.all((slugs as string[]).map(getBook));
    // Demo preview titles show prices but can never be bought.
    if (books.some(book => !book || !isSaleable(book) || book.facts?._demo === "true")) return reply("A selected book is not available for sale.", 409);
    for (const book of books) {
      if (!book?.file_url || !normaliseFileType(book.file_format)) return reply("Purchased file is not configured for delivery.", 503);
      if (typeof book.file_sha256 !== "string" || book.file_sha256.length !== 64 || !/^[a-f0-9]{64}$/i.test(book.file_sha256))
        return reply("Purchased file integrity is not configured for delivery.", 503);
      if (book.file_url.startsWith("private:")) {
        if (!/^[^\\/:\x00]+$/.test(book.file_url.slice(8)) || [".", ".."].includes(book.file_url.slice(8)))
          return reply("Purchased file is not configured for delivery.", 503);
      } else {
        const url = new URL(book.file_url);
        const privateBlob = /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname);
        const allowed = (process.env.BOOK_STORAGE_ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase());
        if (url.protocol !== "https:" || url.username || url.password || url.port ||
            (privateBlob ? !env("BLOB_READ_WRITE_TOKEN") : !allowed.includes(url.hostname.toLowerCase())))
          return reply("Purchased file storage is not configured.", 503);
      }
    }
    const now = new Date();
    // The only pricing path: offers are priced on the server, and the customer must have seen this exact total.
    const [offers, lines, customer] = await Promise.all([loadOffers(), cartLines(books as Book[], now), customerHistory(email)]);
    const pricing = priceCart(lines, offers, { now, code: coupon || null, customer });
    if (body.expectedTotal !== undefined && body.expectedTotal !== pricing.total)
      return NextResponse.json({ error: "Prices changed.", pricing }, { status: 409 });
    const items = books.map((book, i) => ({
      slug: book!.slug, title: book!.title, price: pricing.lines[i].price, discount: pricing.lines[i].discount, list_price: book!.price_inr,
      file_url: book!.file_url, file_format: book!.file_format, file_sha256: book!.file_sha256,
      edition: book!.edition || null,
    }));
    const { subtotal, tax } = computeTotals(pricing.lines.map(l => l.base));
    const total = pricing.total + tax;
    const id = crypto.randomBytes(18).toString("base64url");
    // Offer columns exist only once the admin turned offers on, and offers apply only then.
    const inserted = (pricing.applied.length ? await sql`
      insert into orders (id,name,email,phone,items,subtotal,tax,total,discount,offers,checkout_key,checkout_hash,reader_id,is_dev,razorpay_order_id)
      values (${id},${name},${email},${phone},${JSON.stringify(items)}::jsonb,${subtotal},${tax},${total},${pricing.discount},${JSON.stringify(pricing.applied)}::jsonb,
        ${key},${hash},${reader?.id || null},${configuration.dev},${configuration.dev ? `nopay_${id}` : null})
      on conflict (checkout_key) do nothing returning *
    ` : await sql`
      insert into orders (id,name,email,phone,items,subtotal,tax,total,checkout_key,checkout_hash,reader_id,is_dev,razorpay_order_id)
      values (${id},${name},${email},${phone},${JSON.stringify(items)}::jsonb,${subtotal},${tax},${total},
        ${key},${hash},${reader?.id || null},${configuration.dev},${configuration.dev ? `nopay_${id}` : null})
      on conflict (checkout_key) do nothing returning *
    `) as CheckoutOrder[];
    if (!inserted.length) {
      const raced = await sql`select * from orders where checkout_key = ${key}` as CheckoutOrder[];
      return raced[0] ? await respond(raced[0]) : reply("Checkout is pending.", 202);
    }
    if (!reader) await grantGuestOrder(id);
    return await respond(inserted[0]);
  } catch {
    console.error("[checkout] checkout failed");
    return reply("Could not start checkout. Please try again with the same idempotency key.", 503);
  }
}

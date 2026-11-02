import { orderSavings, rupees } from "./money";
import type { Order } from "./db";
import { env } from "./env";
import { STORE } from "./store";

export type EmailPayload = { to: string; subject: string; html: string; from?: string };

export async function sendEmail(payload: EmailPayload, idempotencyKey?: string) {
  const key = env("RESEND_API_KEY");
  const from = payload.from || env("MAIL_FROM");
  if (!key || !from) throw new Error("Email delivery is not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ ...payload, from }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Email delivery failed (${res.status})`);
    const result = await res.json();
    if (typeof result.id !== "string") throw new Error("Invalid email provider response");
    return result.id as string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const BRAND = {
  ink: "#15151f",
  soft: "#4a4a58",
  mute: "#44444f",
  line: "#e4e5ee",
  bg: "#FFFFFF",
  bg2: "#f8f8fb",
  brand: "#2e2e7e",
  gold: "#299637",
};

/** Table-based layout and inline styles: Gmail strips <style> blocks. */
const shell = (body: string, preheader = "") => `
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(STORE.name)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg2};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg2};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:600px;background:${BRAND.bg};border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

    <tr><td style="padding:28px 32px 0;">
      <table role="presentation" width="100%"><tr>
        <td style="font-size:15px;font-weight:600;letter-spacing:-0.02em;color:${BRAND.ink};">
          ${escapeHtml(STORE.name)}
        </td>
        <td align="right" style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.gold};">
          ${escapeHtml(STORE.kicker)}
        </td>
      </tr></table>
      <div style="height:1px;background:${BRAND.line};margin:18px 0 0;"></div>
    </td></tr>

    <tr><td style="padding:28px 32px 32px;">${body}</td></tr>

    <tr><td style="padding:0 32px 28px;">
      <div style="height:1px;background:${BRAND.line};margin-bottom:16px;"></div>
      <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.mute};">
        ${escapeHtml(STORE.legalEntity)}
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.soft};">
        Questions about your order? Just reply to this email.
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

const btn = (href: string, label: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
  <tr><td style="border-radius:10px;background:${BRAND.brand};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr>
</table>`;

/** Invoice number is derived, not stored twice: INV-YYYYMM-<order id>. */
export function invoiceNo(order: Order) {
  const d = new Date(order.paid_at || order.created_at);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `INV-${ym}-${order.id.slice(0, 8).toUpperCase()}`;
}

export function confirmationPayload(order: Order, siteUrl: string): EmailPayload {
  const site = new URL(siteUrl);
  if (site.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && site.protocol === "http:")) throw new Error("Invalid email site URL");
  const orderUrl = escapeHtml(`${site.origin}/order/${encodeURIComponent(order.id)}`);
  const inv = invoiceNo(order);
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.line};font-size:15px;color:${BRAND.ink};">
          ${escapeHtml(i.title)}<br>
          <span style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.mute};">Digital download &middot; PDF</span>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid ${BRAND.line};font-family:'Courier New',monospace;font-size:15px;color:${BRAND.ink};white-space:nowrap;">${typeof i.list_price === "number" && i.list_price > i.price ? `<s style="color:${BRAND.mute};">${rupees(i.list_price)}</s> ` : ""}${rupees(i.price)}</td>
      </tr>`
    )
    .join("");

  const taxRow = order.tax
    ? `<tr><td style="padding:8px 0;font-size:14px;color:${BRAND.soft};">Tax</td>
       <td align="right" style="padding:8px 0;font-family:'Courier New',monospace;font-size:14px;color:${BRAND.soft};">${rupees(order.tax)}</td></tr>`
    : "";

  return {
    from: env("MAIL_FROM"),
    to: order.email,
    subject: `Your book is ready ${inv}`,
    html: shell(
      `
      <p style="margin:0 0 10px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.mute};">Order confirmed</p>
      <h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;letter-spacing:-0.03em;font-weight:600;color:${BRAND.ink};">
        Thank you${order.name ? `, ${escapeHtml(order.name.split(" ")[0])}` : ""}.<br>Your copy is ready.
      </h1>
      <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:${BRAND.soft};">
        Payment received. Download below &mdash; the link on your order page is
        regenerated every time you open it, so this email keeps working.
      </p>

      ${btn(`${site.origin}/order/${encodeURIComponent(order.id)}`, "Download your book →")}

      <p style="margin:14px 0 30px;font-size:13px;color:${BRAND.soft};">
        Or copy this link: <a href="${orderUrl}" style="color:${BRAND.brand};">${orderUrl}</a>
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${BRAND.bg2};border:1px solid ${BRAND.line};border-radius:12px;padding:20px;">
        <tr><td>
          <p style="margin:0 0 14px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.mute};">
            Invoice ${escapeHtml(inv)}
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${rows}
            ${taxRow}
            <tr>
              <td style="padding:12px 0 0;font-size:15px;font-weight:600;color:${BRAND.ink};">Total paid</td>
              <td align="right" style="padding:12px 0 0;font-family:'Courier New',monospace;font-size:17px;font-weight:600;color:${BRAND.brand};">${rupees(order.total)}</td>
            </tr>
            ${orderSavings(order) > 0 ? `<tr><td style="padding:8px 0 0;font-size:14px;color:${BRAND.ink};">You saved</td><td align="right" style="padding:8px 0 0;font-family:'Courier New',monospace;font-size:15px;color:${BRAND.ink};">${rupees(orderSavings(order))}</td></tr>` : ""}
          </table>
          <div style="height:1px;background:${BRAND.line};margin:16px 0;"></div>
          <p style="margin:0;font-size:12px;line-height:1.7;color:${BRAND.soft};">
            Billed to ${escapeHtml(order.name || order.email)}<br>
            ${escapeHtml(order.email)}${order.phone ? ` &middot; ${escapeHtml(order.phone)}` : ""}<br>
            Order <span style="font-family:'Courier New',monospace;">${escapeHtml(order.id)}</span>
          </p>
        </td></tr>
      </table>

      <p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:${BRAND.soft};">
        Your copy carries a non-secret licence identifier. It is licensed for your personal
        use &mdash; please do not redistribute it.
      </p>`,
      `Your copy of ${order.items[0]?.title ?? "your book"} is ready to download.`,
    ),
  };
}

export function orderConfirmation(order: Order, siteUrl: string) {
  return sendEmail(confirmationPayload(order, siteUrl), `order-confirmation/${order.id}`);
}

export function alertAdmin(subject: string, message: string, details?: unknown) {
  const adminEmail = env("ADMIN_EMAIL");
  if (!adminEmail) {
    console.warn("[email-alert] ADMIN_EMAIL unset; alert message:", subject, message);
    return;
  }

  const detailsFormatted = details
    ? `<pre style="background:#f5f5fa;padding:12px;border-radius:6px;font-size:12px;overflow:auto">${escapeHtml(JSON.stringify(details, null, 2))}</pre>`
    : "";

  return sendEmail({
    to: adminEmail,
    subject: `[${STORE.name}] ${subject}`,
    html: shell(`
      <div style="font-size:20px;font-weight:600;color:#B3261E;margin-bottom:12px">${escapeHtml(subject)}</div>
      <p style="color:#4a4a58;line-height:1.6">${escapeHtml(message)}</p>
      ${detailsFormatted}
    `)
  });
}


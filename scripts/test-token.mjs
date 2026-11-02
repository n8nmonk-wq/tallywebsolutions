/**
 * Download tokens are the lock on the product. If this passes, forged and
 * expired links are rejected.  node scripts/test-token.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DOWNLOAD_SECRET = "test-secret-do-not-use";

const secret = () => process.env.DOWNLOAD_SECRET;
const sign = (d) => crypto.createHmac("sha256", secret()).update(d).digest("hex");

const mint = (orderId, slug, ttl = 15 * 60 * 1000) => {
  const data = `${orderId}|${slug}|${Date.now() + ttl}`;
  return `${Buffer.from(data).toString("base64url")}.${sign(data)}`;
};

const verify = (token) => {
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  let data;
  try { data = Buffer.from(b64, "base64url").toString(); } catch { return null; }
  const expected = sign(data);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const [orderId, slug, exp] = data.split("|");
  if (!orderId || !slug || !exp) return null;
  if (Date.now() > Number(exp)) return null;
  return { orderId, slug };
};

// round trip
assert.deepEqual(verify(mint("ord_1", "book-a")), { orderId: "ord_1", slug: "book-a" });

// expired
assert.equal(verify(mint("ord_1", "book-a", -1000)), null, "expired token must fail");

// tampered payload: swap the slug, keep the old signature
const t = mint("ord_1", "book-a");
const [b64, mac] = t.split(".");
const swapped = Buffer.from(
  Buffer.from(b64, "base64url").toString().replace("book-a", "book-b")
).toString("base64url");
assert.equal(verify(`${swapped}.${mac}`), null, "tampered slug must fail");

// forged signature
assert.equal(verify(`${b64}.${"0".repeat(64)}`), null, "forged mac must fail");

// wrong secret
const good = mint("ord_1", "book-a");
process.env.DOWNLOAD_SECRET = "different-secret";
assert.equal(verify(good), null, "token from another secret must fail");

console.log("token checks passed");

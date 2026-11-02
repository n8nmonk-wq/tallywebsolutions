import crypto from "node:crypto";
import { requireEnv } from "./env";

/**
 * Download tokens: HMAC over orderId|slug|exp. Stateless, unforgeable, expiring.
 * The file itself is never exposed by URL /api/download is the only door,
 * which is also what lets us count downloads server-side.
 */
const TTL_MS = 15 * 60 * 1000;

const secret = () =>
  requireEnv(
    "DOWNLOAD_SECRET",
    "Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );

const sign = (data: string) =>
  crypto.createHmac("sha256", secret()).update(data).digest("hex");

export function mintDownloadToken(orderId: string, slug: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId) || !/^[a-z0-9][a-z0-9_-]{0,100}$/.test(slug)) throw new Error("Invalid token claim");
  const exp = Date.now() + TTL_MS;
  const data = `${orderId}|${slug}|${exp}`;
  return `${Buffer.from(data).toString("base64url")}.${sign(data)}`;
}

export function verifyDownloadToken(
  token: string
): { orderId: string; slug: string } | null {
  if (!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token) || token.length > 1024) return null;
  const [b64, mac] = token.split(".");

  let data: string;
  try {
    data = Buffer.from(b64, "base64url").toString();
  } catch {
    return null;
  }

  const expected = sign(data);
  // Constant-time compare; bail if lengths differ or timingSafeEqual throws.
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }

  const parts = data.split("|");
  const [orderId, slug, exp] = parts;
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]{1,100}$/.test(orderId) || !/^[a-z0-9][a-z0-9_-]{0,100}$/.test(slug) || !/^\d+$/.test(exp)) return null;
  if (!Number.isSafeInteger(Number(exp)) || Date.now() >= Number(exp)) return null;

  return { orderId, slug };
}

// Domain separation makes this printable identifier unusable as an access token.
export function licenceId(orderId: string, slug: string) {
  return sign(`licence:v1:${JSON.stringify([orderId, slug])}`).slice(0, 24);
}

/**
 * Customer detail validation.
 *
 * Honest limits, stated up front:
 *  - Disposable EMAIL is caught by a domain blocklist. Blocklists are always
 *    behind; a determined buyer will get through. It stops the common cases.
 *  - A "temporary" PHONE number cannot be detected at all without sending an
 *    SMS OTP. What follows is format validation only: it rejects malformed and
 *    obviously fake numbers, not burner SIMs or virtual numbers.
 *    ponytail: add an SMS OTP step if phone quality ever actually matters.
 */

/** Common throwaway-mail providers. Extend as new ones show up in orders. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "throwawaymail.com", "yopmail.com", "yopmail.fr", "getnada.com", "nada.email",
  "trashmail.com", "trashmail.de", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "mailnesia.com", "mytemp.email", "tempinbox.com",
  "spamgourmet.com", "mohmal.com", "emailondeck.com", "burnermail.io",
  "temp-mail.io", "tmpmail.org", "moakt.com", "luxusmail.org", "inboxkitten.com",
  "grr.la", "spam4.me", "mailcatch.com", "harakirimail.com", "tempr.email",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function validateEmail(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(value)) return { ok: false, error: "Enter a valid email address." };

  const domain = value.split("@")[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      ok: false,
      error:
        "Please use a permanent email address your book is delivered there.",
    };
  }
  return { ok: true, value };
}

/**
 * Indian mobile numbers. Accepts 10 digits or +91/0 prefixed, normalises to
 * +91XXXXXXXXXX. Real mobile series start 6-9; landlines and 1-5 prefixes are
 * rejected because the number is used for order contact and SMS.
 */
export function validatePhone(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { ok: false, error: "Phone number is required." };

  const local =
    digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith("0") && digits.length === 11
        ? digits.slice(1)
        : digits;

  if (local.length !== 10) {
    return { ok: false, error: "Enter a 10-digit Indian mobile number." };
  }
  if (!/^[6-9]/.test(local)) {
    return { ok: false, error: "That is not a valid mobile number." };
  }
  // 9999999999, 8888888888 etc. never real, always test input.
  if (/^(\d)\1{9}$/.test(local)) {
    return { ok: false, error: "That is not a valid mobile number." };
  }
  return { ok: true, value: `+91${local}` };
}

export function validateName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 2) return { ok: false, error: "Please enter your full name." };
  if (value.length > 100) return { ok: false, error: "That name is too long." };
  if (!/[\p{L}]{2}/u.test(value)) return { ok: false, error: "Please enter your full name." };
  return { ok: true, value };
}

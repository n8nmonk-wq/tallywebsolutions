import { env } from "@/lib/env";

/**
 * No-payment mode silently marks orders paid, which looks exactly like a
 * successful purchase. That is fine for local work and very confusing when you
 * are trying to test the real Razorpay flow — so say so, loudly.
 *
 * Renders nothing in production, where no-payment mode cannot activate.
 */
export default function DevPaymentNotice() {
  if (process.env.NODE_ENV === "production") return null;
  if (env("RAZORPAY_KEY_ID")) return null;

  return (
    <div className="border-b border-gold/40 bg-gold/10">
      <p className="wrap py-2.5 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-gold">
        <strong className="font-semibold uppercase">Test mode</strong> — no
        Razorpay keys in <code>.env.local</code>, so checkout skips payment and
        marks orders paid immediately. Add RAZORPAY_KEY_ID and
        RAZORPAY_KEY_SECRET to exercise the real flow.
      </p>
    </div>
  );
}

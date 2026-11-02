import { Legal, ENTITY } from "@/components/legal";
export const metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <Legal title="Privacy Policy">
      <p>We collect only what is needed to deliver a book you have paid for: your
      name, email address, phone number, and the record of your order.</p>
      <p>Payments are processed by Razorpay. We never see or store your card,
      UPI or bank details.</p>
      <p>Your email is used to send your download link and order confirmation. We
      do not sell it, and we do not send marketing unless you ask us to.</p>
      <p>We log download events (time, IP address, browser) against your order to
      detect abuse of the download limit. These logs are kept for one year.</p>
      {ENTITY.email && <p>To have your data removed, write to {ENTITY.email}.</p>}
      <p>Order records
      required for tax and accounting are retained as the law requires.</p>
    </Legal>
  );
}

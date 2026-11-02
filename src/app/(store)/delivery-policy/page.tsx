import { Legal, ENTITY } from "@/components/legal";
export const metadata = { title: "Delivery Policy" };

export default function Page() {
  return (
    <Legal title="Delivery Policy">
      <p>All books sold here are <strong>digital</strong>. Nothing is shipped and
      no physical delivery takes place.</p>
      <p>After your payment is confirmed and your digital copy is prepared:</p>
      <ul>
        <li>a download link appears on your order page, and</li>
        <li>the same link is emailed to the address you entered at checkout.</li>
      </ul>
      <p>Download links expire after 15 minutes for security. Reopening your order
      page issues a fresh link at any time, so access does not lapse. Each book may
      be downloaded up to 10 times.</p>
      <p>If your confirmation email has not arrived within 15 minutes, check your
      spam folder and visit your order page to see its status.{ENTITY.email && <> You can also write to {ENTITY.email} with your order number.</>}</p>
    </Legal>
  );
}

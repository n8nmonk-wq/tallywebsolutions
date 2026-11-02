import { Legal, ENTITY } from "@/components/legal";
export const metadata = { title: "Refund Policy" };

export default function Page() {
  return (
    <Legal title="Refund Policy">
      <p><strong>Digital add-ons cannot be returned once downloaded.</strong> This
      is stated at checkout before you pay.</p>
      <p>We will refund you in full if:</p>
      <ul>
        <li>the file will not open or is corrupted, and we cannot replace it;</li>
        <li>the add-on does not work with the TallyPrime version stated on its page, and we cannot fix it;</li>
        <li>you were charged more than once for the same order;</li>
        <li>payment was taken but no add-on was delivered.</li>
      </ul>
      {ENTITY.email && <p>Write to {ENTITY.email} with your order number within 7 days of purchase.</p>}
      <p>Approved refunds are issued to the original payment method and
      typically reach you within 5 to 7 working days, depending on your bank.</p>
    </Legal>
  );
}

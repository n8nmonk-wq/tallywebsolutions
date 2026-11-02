import { Legal, ENTITY } from "@/components/legal";
import { STORE } from "@/lib/store";
export const metadata = { title: "Terms of Use" };

export default function Page() {
  return (
    <Legal title="Terms of Use">
      <p>These terms govern the purchase of digital add-ons through {STORE.name}.</p>
      <p><strong>Your licence.</strong> Buying an add-on grants you a personal,
      non-transferable licence to use it in your own TallyPrime. You may keep copies for your own use.
      You may not redistribute, resell, upload or publish the file.</p>
      <p><strong>Your copy is identifiable.</strong> Each file is associated with
      the purchasing email address.</p>
      <p><strong>Pricing.</strong> All prices are in Indian Rupees. We may change
      prices at any time; the price shown at checkout is the price you pay.</p>
      <p><strong>Availability.</strong> We aim to keep downloads available
      continuously but do not guarantee uninterrupted access.{ENTITY.email && <> If you cannot reach
      your file, write to {ENTITY.email} and we will resolve it.</>}</p>
      <p><strong>Governing law.</strong> These terms are governed by the laws of
      India.</p>
    </Legal>
  );
}

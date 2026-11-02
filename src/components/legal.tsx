/**
 * Razorpay will not activate an account without these four pages live and
 * reachable. The bracketed fields must be filled with the real entity details
 * before activation is submitted.
 */

import { STORE } from "@/lib/store";

/**
 * The storefront is unbranded because it carries many authors, but the seller
 * still has to be named here: Razorpay will not activate an account whose
 * policy pages do not identify the entity receiving the money.
 */
export const ENTITY = {
  name: STORE.legalEntity,
  address: STORE.legalAddress,
  email: STORE.supportEmail,
  phone: STORE.supportPhone,
};

export function Legal({
  title,
  updated = "22 August 2026",
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="wrap prose-legal max-w-[760px] py-18">
      <p className="eyebrow mb-5">Last updated {updated}</p>
      <h1 className="title title-lg mb-3">{title}</h1>
      <hr className="gold-rule mb-10" />
      {children}
      {(ENTITY.name || ENTITY.address || ENTITY.email || ENTITY.phone) && <address className="mt-12 border-t border-line pt-5 text-sm not-italic text-ink-soft">
        {ENTITY.name && <div>{ENTITY.name}</div>}
        {ENTITY.address && <div>{ENTITY.address}</div>}
        {ENTITY.email && <a href={`mailto:${ENTITY.email}`}>{ENTITY.email}</a>}
        {ENTITY.email && ENTITY.phone && " · "}{ENTITY.phone}
      </address>}
    </div>
  );
}

export function sameOrigin(origin: string | null, url: string) {
  try { return !!origin && new URL(origin).origin === new URL(url).origin; }
  catch { return false; }
}

export function ownsOrder(email: string | null, orderEmail: string) {
  return !!email && email.toLowerCase() === orderEmail.toLowerCase();
}

export function saleable(book: {
  active: boolean; price_inr: number; file_url: string | null;
  release_approved?: boolean; scan_status?: string; third_party?: boolean;
  rights_approved?: boolean; commercial_approved?: boolean;
}) {
  return book.active && Number.isSafeInteger(book.price_inr) && book.price_inr > 0
    && !!book.file_url && book.release_approved === true && book.scan_status === 'clean'
    && (!book.third_party || (book.rights_approved === true && book.commercial_approved === true));
}

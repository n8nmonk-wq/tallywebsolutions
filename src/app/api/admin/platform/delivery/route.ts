import { isAdmin } from '@/lib/admin-auth';
import { checkOrigin } from '@/lib/reader-auth';
import { readLimitedForm } from '@/lib/submissions';
import { RecoveryError, recoverDelivery } from '@/lib/recovery';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!checkOrigin(req) || !(await isAdmin())) return Response.json({ error: 'Not authorised.' }, { status: 403 });
  try {
    const form = await readLimitedForm(req, 4000);
    if (form.get('confirmed') !== 'on') return Response.json({ error: 'Confirm your recovery checks before continuing.' }, { status: 400 });
    await recoverDelivery(String(form.get('id') || ''), String(form.get('action') || ''), String(form.get('reason') || ''), String(form.get('slug') || ''));
    return NextResponse.redirect(new URL('/admin/platform/delivery?saved=1', req.url), 303);
  } catch (error) {
    if (error instanceof RecoveryError) return Response.json({ error: error.message }, { status: 409 });
    console.error('[delivery recovery] failed');
    return Response.json({ error: 'Recovery could not complete. Reload the order and check its payment status and product file.' }, { status: 409 });
  }
}

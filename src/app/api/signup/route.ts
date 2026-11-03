import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';
import { sameOrigin } from '@/lib/access-policy';
import { clientKey, consumeLimit } from '@/lib/rate-limit';
import { validateSignup } from '@/lib/signup';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request.headers.get('origin'), request.url)) return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  if (!process.env.AUTH_SECRET) return NextResponse.json({ error: 'Sign-up is not available yet.' }, { status: 503 });
  if (!(await consumeLimit(clientKey(request, 'signup'), 10, 3600))) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Check the form and try again.' }, { status: 400 }); }
  const result = validateSignup(typeof body === 'object' && body !== null ? body as Record<string, unknown> : {});
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const { name, email, password, firstName, lastName, country, phone } = result.value;
  try {
    await getAuth().api.signUpEmail({ body: { name, email, password, firstName, lastName, country, phone } as never });
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 422) {
      return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'We could not create your account. Please try again.' }, { status: 500 });
  }
}

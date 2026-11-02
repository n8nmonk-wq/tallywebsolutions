import { getAuth } from '@/lib/auth';
import { sameOrigin } from '@/lib/access-policy';
export const runtime = 'nodejs';
async function handle(request: Request) {
  if (request.method === 'POST' && !sameOrigin(request.headers.get('origin'), request.url)) {
    return Response.json({ message: 'Not authorised.' }, { status: 403 });
  }
  if (!process.env.AUTH_SECRET || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    return Response.json({ message: 'Email sign-in is not available yet. Please try again later.' }, { status: 503 });
  }
  try { return await getAuth().handler(request); }
  catch { return Response.json({ message: 'Sign-in is temporarily unavailable.' }, { status: 503 }); }
}
export const GET = handle;
export const POST = handle;

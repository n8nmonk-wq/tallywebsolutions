import { getAuth } from '@/lib/auth';
import { checkOrigin } from '@/lib/reader-auth';
import { signOut } from '@/lib/admin-auth';
export async function POST(request: Request) {
  if (!checkOrigin(request)) return new Response('Forbidden', { status: 403 });
  await signOut();
  if (!process.env.AUTH_SECRET) return Response.redirect(new URL('/', request.url), 303);
  const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  const headers = new Headers(response.headers);
  headers.set('location', new URL('/', request.url).href);
  return new Response(null, { status: 303, headers });
}

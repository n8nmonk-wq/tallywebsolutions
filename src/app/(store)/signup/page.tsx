import SignupForm from './SignupForm';
import { env } from '@/lib/env';
import { countryOptions } from '@/lib/signup';
export const metadata = { title: 'Create account', robots: { index: false, follow: false } };
export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') && !params.next.includes('\\') ? params.next : '/library';
  return <section className="wrap max-w-[640px] py-16"><p className="eyebrow mb-4">Create your account</p>
    <h1 className="title title-lg mb-5">Start your library.</h1>
    <p className="text-ink-soft mb-8">Your library opens once you verify your email address.</p>
    <SignupForm next={next} countries={countryOptions()} googleEnabled={!!env('GOOGLE_CLIENT_ID') && !!env('GOOGLE_CLIENT_SECRET')} /></section>;
}

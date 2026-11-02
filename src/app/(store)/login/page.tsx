import LoginForm from './LoginForm';
export const metadata = { title: 'Your library', robots: { index: false, follow: false } };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') && !params.next.includes('\\') ? params.next : '/library';
  return <section className="wrap max-w-[560px] py-16"><p className="eyebrow mb-4">Reader access</p>
    <h1 className="title title-lg mb-5">Your books, together.</h1>
    <p className="text-ink-soft mb-8">Sign in securely to your library or continue your publishing submission.</p>
    <LoginForm next={next} /></section>;
}

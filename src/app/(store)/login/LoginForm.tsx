'use client';
import Link from 'next/link';
import { useState } from 'react';

type Phase = 'idle' | 'busy' | 'unverified' | 'error';

export default function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = String(form.get('email') ?? '').trim().toLowerCase();
    setEmail(address);
    setPhase('busy');
    setMessage('');
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address, password: String(form.get('password') ?? ''), callbackURL: next }),
      });
      if (response.ok) { window.location.href = next; return; }
      if (response.status === 403) {
        setPhase('unverified');
        setMessage('Verify your email first. Open the link we sent when you signed up.');
        return;
      }
      setPhase('error');
      setMessage(response.status === 401 ? 'Email or password is not correct.' : 'We could not sign you in. Please try again.');
    } catch {
      setPhase('error');
      setMessage('We could not sign you in. Please try again.');
    }
  }

  async function resendVerification() {
    try {
      await fetch('/api/auth/send-verification-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, callbackURL: next }),
      });
      setMessage('A new verification link is on its way.');
    } catch {
      setMessage('We could not send the link. Please try again later.');
    }
  }

  async function signInWithGoogle() {
    setPhase('busy');
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: next }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.url) { window.location.href = data.url; return; }
      setPhase('error');
      setMessage('Google sign-in is not available right now.');
    } catch {
      setPhase('error');
      setMessage('Google sign-in is not available right now.');
    }
  }

  const busy = phase === 'busy';
  return <div className="space-y-6">
    {googleEnabled && <div className="space-y-4">
      <button type="button" className="btn btn-ghost w-full justify-center" onClick={signInWithGoogle} disabled={busy}>Continue with Google</button>
      <p className="text-center text-sm text-ink-soft">or sign in with your email</p>
    </div>}
    <form onSubmit={submit} className="space-y-5">
      <div><label className="field-label" htmlFor="email">Email address</label>
        <input className="field-input" id="email" name="email" type="email" required autoComplete="email" maxLength={254} disabled={busy} /></div>
      <div><label className="field-label" htmlFor="password">Password</label>
        <input className="field-input" id="password" name="password" type="password" required autoComplete="current-password" maxLength={128} disabled={busy} /></div>
      <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      {message && <p role="status" className="text-sm text-ink-soft">{message}</p>}
      {phase === 'unverified' && <button type="button" className="text-link" onClick={resendVerification}>Send the verification link again</button>}
    </form>
    <p className="text-sm text-ink-soft">New here? <Link className="text-link" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
  </div>;
}

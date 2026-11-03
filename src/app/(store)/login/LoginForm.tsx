'use client';
import { useState } from 'react';

export default function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState('sending');
    try {
      const response = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: String(form.get('email')).trim().toLowerCase(), callbackURL: next }),
      });
      setState(response.ok ? 'sent' : 'error');
    } catch { setState('error'); }
  }
  async function signInWithGoogle() {
    setState('sending');
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: next }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.url) { window.location.href = data.url; return; }
      setState('error');
    } catch { setState('error'); }
  }
  return <div className="space-y-6">
    {googleEnabled && <div className="space-y-4">
      <button type="button" className="btn btn-ghost w-full justify-center" onClick={signInWithGoogle} disabled={state === 'sending' || state === 'sent'}>Continue with Google</button>
      <p className="text-center text-sm text-ink-soft">or use your email</p>
    </div>}
    <form onSubmit={submit} className="space-y-5">
      <div><label className="field-label" htmlFor="email">Email address</label>
        <input className="field-input" id="email" name="email" type="email" required autoComplete="email" maxLength={254} disabled={state === 'sending'} onChange={() => setState('idle')} /></div>
      <button className="btn btn-primary" disabled={state === 'sending' || state === 'sent'}>
        {state === 'sending' ? 'Sending...' : state === 'sent' ? 'Check your email' : 'Send sign-in link'}</button>
      <p role="status" className="text-sm text-ink-soft">{state === 'sent' ? 'Check your inbox and spam folder for a sign-in link. It expires in 15 minutes.' : state === 'error' ? 'We could not sign you in. Please try again later.' : 'For purchased add-ons, use your checkout email. For a developer submission, use the email where you would like to hear from us.'}</p>
    </form>
  </div>;
}

'use client';
import { useState } from 'react';

export default function LoginForm({ next }: { next: string }) {
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
  return <form onSubmit={submit} className="space-y-5">
    <div><label className="field-label" htmlFor="email">Email address</label>
      <input className="field-input" id="email" name="email" type="email" required autoComplete="email" maxLength={254} disabled={state === 'sending'} onChange={() => setState('idle')} /></div>
    <button className="btn btn-primary" disabled={state === 'sending' || state === 'sent'}>
      {state === 'sending' ? 'Sending...' : state === 'sent' ? 'Check your email' : 'Send sign-in link'}</button>
    <p role="status" className="text-sm text-ink-soft">{state === 'sent' ? 'Check your inbox and spam folder for a sign-in link. It expires in 15 minutes.' : state === 'error' ? 'We could not send a sign-in link. Please try again later.' : 'For purchased books, use your checkout email. For a publishing submission, use the email where you would like to hear from us.'}</p>
  </form>;
}

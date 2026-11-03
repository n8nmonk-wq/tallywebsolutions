'use client';
import Link from 'next/link';
import { useState } from 'react';
import PhoneInput, { type PhoneCountry } from '@/components/PhoneInput';

export default function SignupForm({ next, countries, googleEnabled }: { next: string; countries: PhoneCountry[]; googleEnabled: boolean }) {
  const [country, setCountry] = useState('IN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('confirmPassword') ?? '')) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: form.get('firstName'), lastName: form.get('lastName'), country,
          phone: form.get('phone'), email: form.get('email'), password,
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok) { setSentTo(String(data?.email ?? form.get('email'))); return; }
      setError(data?.error ?? 'We could not create your account. Please try again.');
    } catch {
      setError('We could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: next }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.url) { window.location.href = data.url; return; }
      setError('Google sign-up is not available right now.');
    } catch {
      setError('Google sign-up is not available right now.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) return <div className="space-y-4">
    <h2 className="title text-2xl">Check your email</h2>
    <p className="text-ink-soft">We sent a verification link to <strong>{sentTo}</strong>. Open it to activate your account, then sign in.</p>
    <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(next)}`}>Go to sign in</Link>
  </div>;

  return <div className="space-y-6">
    {googleEnabled && <div className="space-y-4">
      <button type="button" className="btn btn-ghost w-full justify-center" onClick={signInWithGoogle} disabled={busy}>Continue with Google</button>
      <p className="text-center text-sm text-ink-soft">or create an account with your details</p>
    </div>}
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
      <div><label className="field-label" htmlFor="firstName">First name</label>
        <input className="field-input" id="firstName" name="firstName" required maxLength={60} autoComplete="given-name" disabled={busy} /></div>
      <div><label className="field-label" htmlFor="lastName">Last name</label>
        <input className="field-input" id="lastName" name="lastName" required maxLength={60} autoComplete="family-name" disabled={busy} /></div>
      <div className="sm:col-span-2"><span className="field-label" id="phone-label">Mobile number and country</span>
        <div aria-labelledby="phone-label">
          <PhoneInput countries={countries} country={country} onCountry={setCountry} disabled={busy} />
        </div></div>
      <div className="sm:col-span-2"><label className="field-label" htmlFor="email">Email address</label>
        <input className="field-input" id="email" name="email" type="email" required maxLength={254} autoComplete="email" disabled={busy} /></div>
      <div><label className="field-label" htmlFor="password">Password</label>
        <input className="field-input" id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} /></div>
      <div><label className="field-label" htmlFor="confirmPassword">Confirm password</label>
        <input className="field-input" id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} /></div>
      <div className="sm:col-span-2 space-y-4">
        <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <p className="text-sm text-ink-soft">Already have an account? <Link className="text-link" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
      </div>
    </form>
  </div>;
}

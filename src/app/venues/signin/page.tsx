'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import VenuesHeader from '@/components/venues/VenuesHeader';

// Venue marketplace sign-in. Same two-step code flow as partner sign-in, on
// its own endpoints and session, since marketplace subscribers needn't be
// Stacked partners.
function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(path: string, body: object) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, json: await res.json() };
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { ok, json } = await post('/api/venues/request-code', { email });
      if (!ok) setError(json.error || 'Something went wrong.');
      else setStep('code');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { ok, json } = await post('/api/venues/verify-code', { code });
      if (!ok) setError(json.error || 'That code did not work.');
      else router.push('/venues');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30';
  const btn = 'w-full bg-brand-orange hover:bg-orange-400 active:bg-orange-600 disabled:opacity-50 text-brand-green rounded-full px-5 py-3 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors';

  return (
    <div className="min-h-screen bg-bg">
      <VenuesHeader right={<Link href="/venues/join" className="text-sm underline">See plans</Link>} />
      <div className="flex justify-center py-10 sm:py-16 px-4">
        <div className="w-full max-w-md bg-brand-yellow rounded-[30px] p-7 sm:p-8">
          <h1 className="font-display text-3xl sm:text-4xl mb-3">Sign in to Venues</h1>
          {params.get('paid') && (
            <p className="text-sm mb-4">Payment received. Sign in with the email you paid with.</p>
          )}
          {step === 'email' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                We&apos;ll email you a six-digit code. No password.
              </p>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourcompany.com" className={input} />
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Sending…' : 'Send my code'}</button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                If that email has a subscription, a code is on its way. It expires in 10 minutes.
              </p>
              <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={`${input} text-lg tracking-[0.4em] font-mono`} />
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={busy || code.length < 6} className={btn}>{busy ? 'Checking…' : 'Sign in'}</button>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full text-sm text-gray-600 underline">
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VenuesSignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

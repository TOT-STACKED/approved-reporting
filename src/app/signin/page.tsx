'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Partner sign-in. Deliberately styled to match the LoginPanel on
// wearestacked.io/partner-intelligence — same butter card, same Chunko
// heading, same lock badge — so the hop from the marketing page to here
// doesn't feel like leaving the site.
//
// Two steps on one page: ask for a code, then type it. No passwords exist.

type Step = 'identify' | 'code';

export default function PartnerSignIn() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/partner/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        return;
      }
      setSentTo(data.sentTo);
      setStep('code');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/partner/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'That code did not work.');
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-start justify-center py-10 sm:py-16 px-4">
      <div className="w-full max-w-md bg-brand-yellow rounded-[30px] p-7 sm:p-8">
        <span className="inline-flex items-center gap-2 bg-amber-500 text-brand-green rounded-full px-3 py-1.5 text-xs font-semibold">
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="9" width="12" height="8" rx="2" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
          </svg>
          Secure partner sign in
        </span>

        <h1 className="font-display text-3xl sm:text-4xl mt-5 mb-3">
          Sign in to Partner Intelligence
        </h1>

        {step === 'identify' ? (
          <>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Enter your work email and we&apos;ll send you a six-digit code. No password to
              remember.
            </p>
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-xs font-semibold mb-2">
                  Work email
                </label>
                <input
                  id="identifier"
                  type="email"
                  autoComplete="email"
                  required
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="you@yourcompany.com"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-brand-orange hover:bg-orange-400 active:bg-orange-600 disabled:opacity-50 text-brand-green rounded-full px-5 py-3 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors"
              >
                {busy ? 'Sending…' : 'Send my code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              {sentTo
                ? <>We&apos;ve sent a code to <span className="font-medium text-gray-900">{sentTo}</span>. It expires in 10 minutes.</>
                : <>If that address has an account, a code is on its way. It expires in 10 minutes.</>}
            </p>
            <form onSubmit={verifyCode} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-xs font-semibold mb-2">
                  Six-digit code
                </label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-lg tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="w-full bg-brand-orange hover:bg-orange-400 active:bg-orange-600 disabled:opacity-50 text-brand-green rounded-full px-5 py-3 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors"
              >
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('identify'); setCode(''); setError(''); }}
                className="w-full text-xs text-gray-600 underline hover:no-underline"
              >
                Use a different email
              </button>
            </form>
          </>
        )}

        <p className="text-xs text-gray-600 mt-6 leading-relaxed">
          Haven&apos;t set up an account yet? Open the private link the Stacked team sent you and
          set one up there — it takes a moment. Stuck?{' '}
          <a href="https://www.wearestacked.io/contact" className="underline hover:no-underline">
            Contact the Stacked team.
          </a>
        </p>
      </div>
    </div>
  );
}

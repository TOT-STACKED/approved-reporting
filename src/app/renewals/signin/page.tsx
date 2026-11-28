'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import StackedLogo from '@/components/renewals/StackedLogo';

// Sign in or sign up to renewals.wearestacked.io. Just the log-in: the story
// lives on wearestacked.io/renewals. Open to anyone. Existing members and
// venues with an Intelligence Review go straight in, and anyone new does the
// review as part of signing up (see /renewals/start).

const NIGHT = '#2A1D6B';
const CREAM = '#FAF3E5';
const INK = '#38278F';
const SKY = '#9AD9F7';
const SOFT = '#5B4F8C';

export default function RenewalsSignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(path: string, body: object) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { ok, json } = await post('/api/renewals/request-code', { email });
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
      const { ok, json } = await post('/api/renewals/verify-code', { code });
      if (!ok) setError(json.error || 'That code did not work.');
      else router.push(json.next || '/renewals');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full bg-white border rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-offset-0';
  const inputStyle = { borderColor: '#E4DAC6', color: INK, '--tw-ring-color': `${INK}40` } as React.CSSProperties;
  const button =
    'w-full rounded-full px-6 py-3.5 text-[15px] font-bold uppercase tracking-[-0.01em] transition-[filter] hover:brightness-95 active:brightness-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const buttonStyle = { background: SKY, color: INK, '--tw-ring-color': INK, '--tw-ring-offset-color': CREAM } as React.CSSProperties;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 font-body" style={{ background: NIGHT }}>
      <div className="w-full max-w-[440px] rounded-[28px] p-6 sm:p-10" style={{ background: CREAM, color: INK }}>
        <div className="flex items-center gap-3 mb-7">
          <StackedLogo className="h-6 w-auto" />
          <span className="font-mono text-xs uppercase tracking-[0.1em]" style={{ color: SOFT }}>Renewals</span>
        </div>

        <h1 className="font-display uppercase text-[28px] sm:text-[32px] leading-[0.95] tracking-[-0.02em] mb-3" style={{ color: INK }}>
          Sign in to Renewals
        </h1>

        {step === 'email' ? (
          <form onSubmit={requestCode} className="space-y-3">
            <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
              Enter your work email and we&apos;ll send a six-digit code. No password.
            </p>
            <label htmlFor="renewals-email" className="sr-only">Work email</label>
            <input
              id="renewals-email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourvenue.com"
              className={input}
              style={inputStyle}
            />
            {error && <p role="alert" className="text-sm text-negative-dark">{error}</p>}
            <button type="submit" disabled={busy} className={button} style={buttonStyle}>{busy ? 'Sending…' : 'Send my code'}</button>
            <p className="text-xs leading-relaxed pt-1" style={{ color: SOFT }}>
              Done an Intelligence Review? Use the same email and we&apos;ll bring your stack in.
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
              We&apos;ve sent a code to <strong style={{ color: INK }}>{email}</strong>. It expires in 10 minutes.
            </p>
            <label htmlFor="renewals-code" className="sr-only">Six-digit code</label>
            <input
              id="renewals-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className={`${input} text-lg tracking-[0.4em] font-mono`}
              style={inputStyle}
            />
            {error && <p role="alert" className="text-sm text-negative-dark">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6} className={button} style={buttonStyle}>{busy ? 'Checking…' : 'Continue'}</button>
            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
              className="w-full text-sm underline rounded focus:outline-none focus-visible:ring-2"
              style={{ color: SOFT, '--tw-ring-color': INK } as React.CSSProperties}
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="text-xs leading-relaxed mt-6 pt-5 border-t" style={{ color: SOFT, borderColor: '#E4DAC6' }}>
          Free for operators. Your costs and contracts stay private.
        </p>
      </div>

      <nav className="flex gap-6 mt-6 text-sm" style={{ color: CREAM }} aria-label="About Renewals">
        <a href="https://www.wearestacked.io/renewals" className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline">What is Renewals?</a>
        <a href="https://www.wearestacked.io/privacy" className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline">Privacy</a>
      </nav>
    </main>
  );
}

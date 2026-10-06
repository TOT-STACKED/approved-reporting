'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';

// Renewals sign-in and sign-up, in one. Free for any venue. Existing members
// and venues with an Intelligence Review go straight in; anyone new does the
// review as part of signing up (see /renewals/start).
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

  const input = 'w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20';
  const btn = 'w-full bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-50 text-white rounded-full px-5 py-3 text-sm font-semibold transition-colors';

  return (
    <>
      <RenewalsHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 grid gap-10 md:grid-cols-[1.1fr_1fr] items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted mb-3">Free for hospitality operators</p>
          <h1 className="font-display uppercase text-4xl sm:text-5xl leading-[0.95] mb-5">Never miss a notice period again</h1>
          <p className="text-base text-muted leading-relaxed mb-6 max-w-lg">
            Every tool your venue pays for, what it costs and the last day you can cancel before it auto-renews. In one place, with an email before each deadline.
          </p>
          <ul className="space-y-3 text-sm max-w-lg">
            <li className="flex gap-3"><span className="font-mono text-dim">01</span><span><strong>Tell us your stack once.</strong> Five minutes, and you get a free Intelligence report on how it compares with similar venues. Done one already? We&apos;ll bring it in.</span></li>
            <li className="flex gap-3"><span className="font-mono text-dim">02</span><span><strong>Drop in a contract.</strong> We read the cost, term, renewal date and notice period for you to check.</span></li>
            <li className="flex gap-3"><span className="font-mono text-dim">03</span><span><strong>Get told in time.</strong> Emails 60, 30, 14 and 7 days before every notice deadline.</span></li>
          </ul>
          <p className="text-xs text-dim mt-8 max-w-lg leading-relaxed">
            The costs, contracts and renewal dates you add are private to your team. Stacked never shares them with suppliers.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-[28px] p-7 sm:p-8 order-first md:order-none">
          <h2 className="font-display uppercase text-2xl mb-3">Sign in or sign up</h2>
          {step === 'email' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                Enter your work email and we&apos;ll send a six-digit code. No password. If you&apos;ve done an Intelligence Review, use the same email.
              </p>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourvenue.com" className={input} />
              {error && <p className="text-sm text-negative-dark">{error}</p>}
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Sending…' : 'Send my code'}</button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                We&apos;ve sent a code to {email}. It expires in 10 minutes.
              </p>
              <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={`${input} text-lg tracking-[0.4em] font-mono`} />
              {error && <p className="text-sm text-negative-dark">{error}</p>}
              <button type="submit" disabled={busy || code.length < 6} className={btn}>{busy ? 'Checking…' : 'Sign in'}</button>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full text-sm text-muted underline">
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

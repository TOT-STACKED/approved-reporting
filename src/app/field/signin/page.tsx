'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FieldLockup } from '@/components/field/FieldChrome';

// Sign in with a six-digit code by email. Invite-only: a manager adds agents
// on the Team page. The session lasts 60 days, so an agent signs in once on
// their phone and stays in.
export default function FieldSignIn() {
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'email') {
        const { ok, json } = await post('/api/field/request-code', { email });
        if (!ok) setError(json.error || 'Something went wrong.');
        else setStep('code');
      } else {
        const { ok, json } = await post('/api/field/verify-code', { code });
        if (!ok) setError(json.error || 'Something went wrong.');
        else router.replace(json.next || '/field');
      }
    } catch {
      setError('No signal? Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-ink px-6 text-white" style={{ paddingTop: 'max(env(safe-area-inset-top), 48px)' }}>
      <div className="mx-auto flex w-full w-full max-w-sm flex-1 flex-col">
        <div className="mb-10">
          <FieldLockup />
        </div>

        <h1 className="mb-3 font-display text-[40px] uppercase leading-[0.95] tracking-tight">
          {step === 'email' ? 'Sign in' : 'Check your email'}
        </h1>
        <p className="mb-8 text-[16px] leading-snug text-white/75">
          {step === 'email'
            ? 'We’ll email you a six-digit code. You only need to do this once on this phone.'
            : `We sent a code to ${email}. It lasts ten minutes.`}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {step === 'email' ? (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@wearestacked.io"
              className="h-14 rounded-2xl border-0 bg-white px-5 text-[17px] text-ink placeholder:text-dim focus:outline-none focus:ring-4 focus:ring-primary/40"
            />
          ) : (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="h-16 rounded-2xl border-0 bg-white px-5 text-center font-mono text-[28px] tracking-[0.4em] text-ink placeholder:text-gray-300 focus:outline-none focus:ring-4 focus:ring-primary/40"
            />
          )}

          {error && <p role="alert" className="rounded-xl bg-negative/20 px-4 py-3 text-[15px] text-white">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="h-14 rounded-full bg-primary text-[16px] font-bold uppercase tracking-tight text-white active:bg-primary-press disabled:opacity-60"
          >
            {busy ? 'One moment…' : step === 'email' ? 'Email me a code' : 'Sign in'}
          </button>

          {step === 'code' && (
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="h-12 text-[15px] text-white/70 underline underline-offset-4">
              Use a different email
            </button>
          )}
        </form>
      </div>
    </main>
  );
}

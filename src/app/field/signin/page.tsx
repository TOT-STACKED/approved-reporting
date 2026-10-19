'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FieldLockup } from '@/components/field/FieldChrome';

// Sign in with a six-digit code by email. Invite-only: a manager adds agents
// on the Team page.
//
// Built for iPhone home-screen apps, which reload when you switch away to Mail
// for the code and can drop their cookie between launches:
//   - a remembered phone (DEVICE_KEY, kept after the last code sign-in) is
//     signed straight back in, no code
//   - the step you were on (email sent, waiting for the code) survives a reload

const DEVICE_KEY = 'stacked-field-device';
const PENDING_KEY = 'stacked-field-signin';
const CODE_LIFE_MS = 10 * 60 * 1000;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

export default function FieldSignIn() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(true);

  // A remembered phone goes straight back in; otherwise pick up where the
  // sign-in was left (e.g. after a trip to Mail for the code).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = store.get(DEVICE_KEY);
      if (key) {
        const res = await fetch('/api/field/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).catch(() => null);
        if (res?.ok) { router.replace('/field'); return; }
        if (res && (res.status === 401 || res.status === 403)) store.del(DEVICE_KEY);
      }
      if (cancelled) return;
      try {
        const pending = JSON.parse(store.get(PENDING_KEY) || 'null') as { email: string; at: number } | null;
        if (pending && Date.now() - pending.at < CODE_LIFE_MS) { setEmail(pending.email); setStep('code'); }
        else if (pending) { setEmail(pending.email); store.del(PENDING_KEY); }
      } catch { /* ignore */ }
      setResuming(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

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
        else { setStep('code'); store.set(PENDING_KEY, JSON.stringify({ email, at: Date.now() })); }
      } else {
        const { ok, json } = await post('/api/field/verify-code', { code });
        if (!ok) setError(json.error || 'Something went wrong.');
        else {
          if (json.deviceKey) store.set(DEVICE_KEY, json.deviceKey);
          store.del(PENDING_KEY);
          router.replace(json.next || '/field');
        }
      }
    } catch {
      setError('No signal? Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    setCode('');
    const { ok, json } = await post('/api/field/request-code', { email }).catch(() => ({ ok: false, json: {} as { error?: string } }));
    setBusy(false);
    if (!ok) setError(json.error || 'Couldn’t send a new code.');
    else { store.set(PENDING_KEY, JSON.stringify({ email, at: Date.now() })); setError('New code sent. Use the latest email.'); }
  }

  if (resuming) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-white">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/25 border-t-white" aria-label="Signing you in" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-ink px-6 text-white" style={{ paddingTop: 'max(env(safe-area-inset-top), 48px)' }}>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="mb-10">
          <FieldLockup />
        </div>

        <h1 className="mb-3 font-display text-[40px] uppercase leading-[0.95] tracking-tight">
          {step === 'email' ? 'Sign in' : 'Check your email'}
        </h1>
        <p className="mb-8 text-[16px] leading-snug text-white/75">
          {step === 'email'
            ? 'We’ll email you a six-digit code. You only need to do this once on this phone.'
            : `We sent a code to ${email}. It lasts ten minutes. On iPhone, tap the code above the keyboard to fill it in.`}
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
            <div className="flex justify-between gap-2">
              <button type="button" disabled={busy} onClick={resend} className="h-12 text-[15px] text-white/80 underline underline-offset-4">
                Send a new code
              </button>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); store.del(PENDING_KEY); }} className="h-12 text-[15px] text-white/70 underline underline-offset-4">
                Different email
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

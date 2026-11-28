'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StackedLogo from '@/components/renewals/StackedLogo';

// Venue marketplace sign-in. Same two-step code flow as partner sign-in, on
// its own endpoints and session. Promote partners sign in with the email on
// their partner login. Same look as the partner and team sign-ins: night
// purple page, headline and tiles beside a cream card (card first on phones).

const NIGHT = '#2A1D6B';
const CREAM = '#FAF3E5';
const INK = '#38278F';
const SOFT = '#5B4F8C';
const LINE = '#E4DAC6';

// Pastel tiles from the design system, each with its own ink.
const SECTIONS = [
  { title: '5 reveals a month', body: "Each shows a venue's name and the tech it uses.", bg: '#90D8F0', ink: '#1F4E6E' },
  { title: 'Your categories', body: 'Pick up to 5 when you first sign in each month.', bg: '#B0F070', ink: '#204000' },
  { title: 'Tool ratings', body: 'How each venue rates its tools out of 10, and where it has none.', bg: '#FFF0C0', ink: '#6B4A00' },
  { title: 'Top up any time', body: 'Extra tokens never expire.', bg: '#D8C0F0', ink: '#301878' },
];

function SignIn() {
  const router = useRouter();
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

  const input =
    'w-full bg-white border rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-offset-0';
  const inputStyle = { borderColor: LINE, color: INK, '--tw-ring-color': `${INK}40` } as React.CSSProperties;
  const btn =
    'w-full rounded-full bg-primary hover:bg-primary-hover active:bg-primary-press text-white px-6 py-3.5 text-[15px] font-bold uppercase tracking-[-0.01em] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const btnStyle = { '--tw-ring-color': INK, '--tw-ring-offset-color': CREAM } as React.CSSProperties;

  return (
    <main className="min-h-dvh font-body px-4 py-8 sm:py-12 lg:flex lg:items-center" style={{ background: NIGHT }}>
      <div className="w-full max-w-6xl mx-auto grid gap-8 lg:gap-16 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        {/* Headline and what's inside. Below the card on phones. */}
        <section className="order-2 lg:order-1" style={{ color: CREAM }}>
          <p className="font-mono text-xs uppercase tracking-[0.14em] mb-4" style={{ color: `${CREAM}B3` }}>
            Stacked · Included with Promote
          </p>
          <h1 className="font-display uppercase text-[44px] sm:text-[64px] lg:text-[76px] leading-[0.88] tracking-[-0.02em]">
            Venues
          </h1>
          <p className="text-[15px] sm:text-base leading-relaxed mt-5 max-w-md" style={{ color: `${CREAM}CC` }}>
            Find venues by the tech they run, how they rate it and where they have gaps. A fresh allowance on the 1st of every month.
          </p>

          <ul className="grid grid-cols-2 gap-3 mt-8 max-w-lg">
            {SECTIONS.map(s => (
              <li key={s.title} className="rounded-[18px] p-4" style={{ background: s.bg, color: s.ink }}>
                <p className="font-semibold text-sm leading-tight">{s.title}</p>
                <p className="text-xs leading-snug mt-1.5 opacity-90">{s.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Sign-in card. First on phones. */}
        <div className="order-1 lg:order-2 w-full max-w-[440px] mx-auto lg:mx-0 lg:justify-self-end">
          <div className="rounded-[28px] p-6 sm:p-10" style={{ background: CREAM, color: INK }}>
            <div className="flex items-center gap-3 mb-7">
              <StackedLogo className="h-6 w-auto" />
              <span className="font-mono text-xs uppercase tracking-[0.1em]" style={{ color: SOFT }}>Venues</span>
            </div>

            <h2 className="font-display uppercase text-[28px] sm:text-[32px] leading-[0.95] tracking-[-0.02em] mb-3" style={{ color: INK }}>
              Sign in to Venues
            </h2>

            {step === 'email' ? (
              <form onSubmit={requestCode} className="space-y-3">
                <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
                  Use the email on your Stacked partner login. We&apos;ll email you a six-digit code. No password.
                </p>
                <label htmlFor="venues-email" className="sr-only">Work email</label>
                <input id="venues-email" type="email" required autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourcompany.com" className={input} style={inputStyle} />
                {error && <p role="alert" className="text-sm text-negative-dark">{error}</p>}
                <button type="submit" disabled={busy} className={btn} style={btnStyle}>{busy ? 'Sending…' : 'Send my code'}</button>
              </form>
            ) : (
              <form onSubmit={verify} className="space-y-3">
                <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
                  If that email has a partner login, a code is on its way. It expires in 10 minutes.
                </p>
                <label htmlFor="venues-code" className="sr-only">Six-digit code</label>
                <input id="venues-code" inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={`${input} text-lg tracking-[0.4em] font-mono`} style={inputStyle} />
                {error && <p role="alert" className="text-sm text-negative-dark">{error}</p>}
                <button type="submit" disabled={busy || code.length < 6} className={btn} style={btnStyle}>{busy ? 'Checking…' : 'Sign in'}</button>
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

            <p className="text-xs leading-relaxed mt-6 pt-5 border-t" style={{ color: SOFT, borderColor: LINE }}>
              Venues comes with the Stacked Promote package.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-sm" style={{ color: CREAM }} aria-label="Help">
            <Link href="/venues/join" className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline">How Venues works</Link>
            <a href="https://www.wearestacked.io/contact" className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline">Contact us</a>
          </nav>
        </div>
      </div>
    </main>
  );
}

export default function VenuesSignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

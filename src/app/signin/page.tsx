'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import StackedLogo from '@/components/renewals/StackedLogo';

// Partner sign-in. Same look as the other sign-ins (Renewals, Field): night
// purple page, cream card, Stacked wordmark, Chunko heading, with the
// portal's orange call to action.
//
// Two steps on one page: ask for a code, then type it. No passwords exist.

const NIGHT = '#2A1D6B';
const CREAM = '#FAF3E5';
const INK = '#38278F';
const SOFT = '#5B4F8C';
const LINE = '#E4DAC6';

// Pastel tiles from the design system, each with its own ink.
const SECTIONS = [
  { title: 'Your leads', body: 'Every lead Stacked sends you, MAL through to Closed Won.', bg: '#90D8F0', ink: '#1F4E6E' },
  { title: 'Conversion', body: 'How your pipeline is moving, week by week.', bg: '#B0F070', ink: '#204000' },
  { title: 'Operator sentiment', body: 'What venues say about you in Intelligence reviews.', bg: '#FFF0C0', ink: '#6B4A00' },
  { title: 'Market intelligence', body: 'The tech stacks and tools operators are using.', bg: '#D8C0F0', ink: '#301878' },
];

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

  const input =
    'w-full bg-white border rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-offset-0';
  const inputStyle = { borderColor: LINE, color: INK, '--tw-ring-color': `${INK}40` } as React.CSSProperties;
  const button =
    'w-full rounded-full bg-primary hover:bg-primary-hover active:bg-primary-press text-white px-6 py-3.5 text-[15px] font-bold uppercase tracking-[-0.01em] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const buttonStyle = { '--tw-ring-color': INK, '--tw-ring-offset-color': CREAM } as React.CSSProperties;

  return (
    <main className="min-h-dvh font-body px-4 py-8 sm:py-12 lg:flex lg:items-center" style={{ background: NIGHT }}>
      <div className="w-full max-w-6xl mx-auto grid gap-8 lg:gap-16 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        {/* Headline and what's inside. Below the card on phones. */}
        <section className="order-2 lg:order-1" style={{ color: CREAM }}>
          <p className="font-mono text-xs uppercase tracking-[0.14em] mb-4" style={{ color: `${CREAM}B3` }}>
            Stacked · Approved partners
          </p>
          <h1 className="font-display uppercase text-[44px] sm:text-[64px] lg:text-[76px] leading-[0.88] tracking-[-0.02em]">
            Partner<br />Intelligence
          </h1>
          <p className="text-[15px] sm:text-base leading-relaxed mt-5 max-w-md" style={{ color: `${CREAM}CC` }}>
            Your live view of what Stacked is doing for you: the leads we send, how they convert and what operators think.
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
          {/* For anyone who was only looking: straight back to the website. */}
          <div className="mb-4">
            <a
              href="https://www.wearestacked.io"
              className="inline-flex items-center gap-2 text-sm rounded-full px-1 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
              style={{ color: CREAM, '--tw-ring-color': CREAM } as React.CSSProperties}
            >
              <span aria-hidden>←</span> Back to wearestacked.io
            </a>
          </div>

          <div className="rounded-[28px] p-6 sm:p-10" style={{ background: CREAM, color: INK }}>
            <div className="flex items-center gap-3 mb-7">
              <StackedLogo className="h-6 w-auto" />
              <span className="font-mono text-xs uppercase tracking-[0.1em]" style={{ color: SOFT }}>Partner Intelligence</span>
            </div>

            <h2 className="font-display uppercase text-[28px] sm:text-[32px] leading-[0.95] tracking-[-0.02em] mb-3" style={{ color: INK }}>
              Partner sign in
            </h2>

            {step === 'identify' ? (
              <form onSubmit={requestCode} className="space-y-3">
                <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
                  Enter your work email and we&apos;ll send a six-digit code. No password.
                </p>
                <label htmlFor="identifier" className="sr-only">Work email</label>
                <input
                  id="identifier"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="you@yourcompany.com"
                  className={input}
                  style={inputStyle}
                />
                {error && <p role="alert" className="text-sm text-negative-dark">{error}</p>}
                <button type="submit" disabled={busy} className={button} style={buttonStyle}>
                  {busy ? 'Sending…' : 'Send my code'}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-3">
                <p className="text-[15px] leading-relaxed mb-5" style={{ color: SOFT }}>
                  {sentTo
                    ? <>We&apos;ve sent a code to <strong style={{ color: INK }}>{sentTo}</strong>. It expires in 10 minutes.</>
                    : <>If that address has an account, a code is on its way. It expires in 10 minutes.</>}
                </p>
                <label htmlFor="code" className="sr-only">Six-digit code</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className={`${input} text-lg tracking-[0.4em] font-mono`}
                  style={inputStyle}
                />
                {error && <p role="alert" className="text-sm text-negative-dark">{error}</p>}
                <button type="submit" disabled={busy || code.length < 6} className={button} style={buttonStyle}>
                  {busy ? 'Checking…' : 'Sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('identify'); setCode(''); setError(''); }}
                  className="w-full text-sm underline rounded focus:outline-none focus-visible:ring-2"
                  style={{ color: SOFT, '--tw-ring-color': INK } as React.CSSProperties}
                >
                  Use a different email
                </button>
              </form>
            )}

            <p className="text-xs leading-relaxed mt-6 pt-5 border-t" style={{ color: SOFT, borderColor: LINE }}>
              No account yet? Open the private link the Stacked team sent you to set one up.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 mt-6 text-sm" style={{ color: CREAM }} aria-label="Help">
            <a href="https://www.wearestacked.io/partner-intelligence" className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline">What is Partner Intelligence?</a>
            <a href="https://www.wearestacked.io/contact" className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline">Contact us</a>
          </nav>
        </div>
      </div>
    </main>
  );
}

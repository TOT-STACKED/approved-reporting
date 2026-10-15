'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StackedLogo from '@/components/renewals/StackedLogo';

// The front page of renewals.wearestacked.io: the launch story (from the CFO
// dinner deck) with sign-in and sign-up built in at the top and bottom. Open
// to anyone. Existing members and venues with an Intelligence Review go
// straight in, and anyone new does the review as part of signing up (see
// /renewals/start).
//
// Styled to match wearestacked.io/renewals: off-white page, near-black Chunko
// headlines, periwinkle buttons and figures, soft-blue panels, black sections,
// and orange kept for the logo and highlight tags. Colours come from
// .renewals-theme in globals.css.

const ICON = (name: string) => `/renewals-assets/${name}.png`;
const MARKETPLACE_URL = 'https://www.wearestacked.io/marketplace';
const ADVISORY_URL = 'https://www.wearestacked.io/advisory';

function Sticker({ name, size = 56, tilt = 0, className = '' }: { name: string; size?: number; tilt?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ICON(name)} alt="" width={size} height={size} className={`select-none shrink-0 ${className}`} style={{ transform: `rotate(${tilt}deg)` }} />
  );
}

/** Bold, tracked caps, as the website sets its section kickers. */
function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs sm:text-sm font-bold uppercase tracking-[0.08em] mb-4 ${className}`}>{children}</p>;
}

function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`font-display uppercase text-[36px] sm:text-5xl lg:text-[64px] leading-[0.95] tracking-[-0.03em] ${className}`}>{children}</h2>;
}

/** Orange highlight tag, slightly rotated, like the website's "opportunity found" stamp. */
function Stamp({ children, tilt = 3, className = '' }: { children: React.ReactNode; tilt?: number; className?: string }) {
  return (
    <span className={`inline-block bg-flame text-white text-sm font-bold uppercase rounded-full px-4 py-2.5 shadow-sm ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      {children}
    </span>
  );
}

const CTA = 'bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-50 text-white rounded-full px-6 py-3.5 text-[15px] font-bold uppercase tracking-[-0.01em] transition-colors';

/** Two-step email code form. Used in the hero and again at the bottom. */
function SignInCard() {
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

  const input = 'w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="relative">
      <div className="bg-primary rounded-[34px] p-3 sm:p-4">
        <div className="bg-surface text-ink rounded-[26px] p-6 sm:p-8">
          <p className="font-mono text-xs sm:text-sm uppercase tracking-[0.06em] text-primary mb-3">Stacked Renewals · Sign in or sign up</p>
          {step === 'email' ? (
            <form onSubmit={requestCode} className="space-y-3">
              <p className="text-[15px] text-muted leading-relaxed">Enter your work email and we&apos;ll send a six-digit code. No password.</p>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourvenue.com" className={input} aria-label="Work email" />
              {error && <p className="text-sm text-negative-dark">{error}</p>}
              <button type="submit" disabled={busy} className={`${CTA} w-full`}>{busy ? 'Sending…' : 'Get started free'}</button>
              <p className="text-xs text-dim">Done an Intelligence Review? Use the same email and we&apos;ll bring your stack in.</p>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3">
              <p className="text-[15px] text-muted leading-relaxed">We&apos;ve sent a code to <strong className="text-ink">{email}</strong>. It expires in 10 minutes.</p>
              <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={`${input} text-lg tracking-[0.4em] font-mono`} aria-label="Six-digit code" />
              {error && <p className="text-sm text-negative-dark">{error}</p>}
              <button type="submit" disabled={busy || code.length < 6} className={`${CTA} w-full`}>{busy ? 'Checking…' : 'Continue'}</button>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full text-sm text-muted underline">
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
      <Stamp className="absolute -top-4 right-6" tilt={4}>Free for operators</Stamp>
    </div>
  );
}

const STATS = [
  { value: '87%', label: 'of software spend is renewals', source: 'Zylo, 2026' },
  { value: '54%', label: 'of software licences actually get used', source: 'Zylo, 2026' },
  { value: '25%+', label: 'overspend without a central view of software', source: 'Gartner, through 2027' },
];

const FEATURES = [
  { icon: 'list', title: 'Track every tool', body: 'Every supplier, contract and cost across your sites.' },
  { icon: 'check', title: 'Read the contract for you', body: 'Drop in a PDF. We pull out notice periods, renewal dates and costs.' },
  { icon: 'clock', title: 'Alerts before every deadline', body: 'Time to cancel or renegotiate before anything auto-renews.' },
  { icon: 'chart', title: 'Spend by site and category', body: "Cost per site, and the tools you're paying for twice." },
];

const DEADLINES = [
  { name: 'Leat', days: 5, tone: 'bg-negative-tint text-negative-dark' },
  { name: 'Lightspeed', days: 11, tone: 'bg-negative-tint text-negative-dark' },
  { name: 'Planday', days: 25, tone: 'bg-warning-tint text-warning-dark' },
  { name: 'SevenRooms', days: 86, tone: 'bg-surface-2 text-muted' },
];

const SPEND = [
  { label: 'POS', value: 520 },
  { label: 'Workforce', value: 410 },
  { label: 'Reservations', value: 233 },
  { label: 'Loyalty', value: 180 },
  { label: 'Accounting', value: 120 },
];

export default function RenewalsLandingPage() {
  const wrap = 'max-w-6xl mx-auto px-4 sm:px-8';
  const card = 'bg-surface rounded-[26px]';
  return (
    <div className="text-ink bg-bg">
      {/* Header */}
      <header className="border-b border-border">
        <div className={`${wrap} h-16 sm:h-[88px] flex items-center justify-between`}>
          <Link href="/renewals" className="flex items-center gap-3">
            <StackedLogo className="h-6 sm:h-7 w-auto" />
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">Renewals</span>
          </Link>
          <a href="#start" className="text-sm font-bold uppercase tracking-[0.04em] hover:text-primary">Sign in</a>
        </div>
      </header>

      {/* Hero */}
      <section>
        <div className={`${wrap} pt-12 pb-16 sm:pt-20 sm:pb-24 grid gap-12 lg:grid-cols-[1.2fr_1fr] items-center`}>
          <div>
            <Eyebrow>Free for operators · Built for CFOs and finance teams</Eyebrow>
            <h1 className="font-display uppercase text-[52px] sm:text-7xl lg:text-[84px] leading-[0.92] tracking-[-0.03em] mb-6">
              Stacked<br />Renewals
            </h1>
            <p className="text-2xl sm:text-[28px] font-bold tracking-[-0.02em] mb-5">Never miss a notice period again.</p>
            <p className="text-lg text-muted max-w-xl leading-relaxed mb-8">
              Every tool your business pays for, what it costs, and the last day you can cancel before it auto-renews. One list, across every site.
            </p>
            <div className="hidden sm:flex items-center gap-4">
              <Sticker name="clock" size={64} tilt={-8} />
              <Sticker name="check" size={56} tilt={6} />
              <Sticker name="chart" size={60} tilt={-4} />
              <Sticker name="ticket" size={56} tilt={8} />
            </div>
          </div>
          <SignInCard />
        </div>
      </section>

      {/* The problem */}
      <section className="bg-surface border-y border-border">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow className="text-primary">The problem</Eyebrow>
          <H2 className="mb-10">Auto-renewals<br />nobody saw coming.</H2>
          <div className="bg-bg rounded-[26px] p-6 sm:p-10">
            <div className="hidden sm:grid grid-cols-[3fr_1fr_4fr] mb-3">
              <div><p className="font-mono text-sm text-dim">MONTH 0</p><p className="font-bold text-lg">Contract starts</p></div>
              <div />
              <div><p className="font-mono text-sm text-dim">MONTH 12</p><p className="font-bold text-lg">Auto-renews</p></div>
            </div>
            <div className="sm:hidden flex justify-between mb-2 text-xs">
              <p><span className="font-mono text-dim">MONTH 0</span><br /><span className="font-bold">Contract starts</span></p>
              <p className="text-right"><span className="font-mono text-dim">MONTH 12</span><br /><span className="font-bold">Auto-renews</span></p>
            </div>
            <div className="relative flex h-10 sm:h-12 rounded-full overflow-hidden text-xs sm:text-sm font-bold whitespace-nowrap">
              <div className="bg-primary text-white flex items-center px-3 sm:px-5" style={{ width: '50%' }}>
                <span className="hidden sm:inline">12-month term</span>
              </div>
              <div className="bg-panel text-ink flex items-center px-3 sm:px-5 flex-1">
                <span className="sm:hidden">+12 months</span>
                <span className="hidden sm:inline">Locked in for another 12 months</span>
              </div>
              <div className="absolute top-0 bottom-0 w-[3px] bg-flame" style={{ left: '37.5%' }} />
            </div>
            <div className="relative h-14 mt-3">
              <div className="absolute -translate-x-1/2 text-center" style={{ left: '37.5%' }}>
                <p className="font-mono text-sm text-flame">MONTH 9</p>
                <p className="font-bold text-flame whitespace-nowrap">Notice deadline missed</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-8">
            <p className="text-6xl sm:text-7xl font-bold tracking-[-0.04em] text-flame leading-none">12.2%</p>
            <p className="text-lg">Average SaaS price rise at renewal, 4.5× general inflation. <span className="font-mono text-sm text-dim">Vertice</span></p>
          </div>
        </div>
      </section>

      {/* The numbers */}
      <section>
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow className="text-primary">The numbers</Eyebrow>
          <H2 className="mb-10">Renewals are where<br />the money goes.</H2>
          <div className="grid gap-4 md:grid-cols-3">
            {STATS.map(s => (
              <div key={s.value} className={`${card} p-7 sm:p-8 min-h-[230px] flex flex-col`}>
                <p className="text-6xl sm:text-7xl font-bold tracking-[-0.04em] text-primary leading-none">{s.value}</p>
                <p className="text-xl font-bold leading-snug mt-auto pt-10">{s.label}</p>
                <p className="font-mono text-sm mt-3 text-dim">{s.source}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-night text-white rounded-[26px] px-7 sm:px-10 py-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8">
            <p className="text-4xl font-bold tracking-[-0.03em] whitespace-nowrap">£50k <span className="text-flame">→ +£6k</span></p>
            <p className="text-base sm:text-lg leading-relaxed text-white/80">Spend £50k a year on tech and 12% renewal inflation adds about £6k next year, for the same tools.</p>
          </div>
        </div>
      </section>

      {/* What it does */}
      <section className="bg-surface border-y border-border">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow className="text-primary">What it does</Eyebrow>
          <H2 className="mb-10">Your whole stack, one list.</H2>
          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-bg rounded-[26px] p-6 sm:p-8 flex items-center gap-6">
                <Sticker name={f.icon} size={76} />
                <div>
                  <h3 className="font-display uppercase text-2xl leading-none mb-2">{f.title}</h3>
                  <p className="text-muted leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className={`${wrap} py-16 sm:py-24`}>
          <H2 className="mb-10">How it works</H2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { n: '01', title: 'Add your software', body: 'Upload contracts or add tools by hand. Done an Intelligence Review? Your stack is already in.' },
              { n: '02', title: 'We pull out the key dates', body: 'Notice periods, renewal dates and costs, read from the contract.' },
              { n: '03', title: 'Act before the deadline', body: 'Alerts, plus Stacked Intelligence on whether to renew.' },
            ].map(s => (
              <div key={s.n} className={`${card} p-7 sm:p-8 min-h-[240px]`}>
                <p className="font-mono text-sm font-semibold mb-3">{s.n}</p>
                <h3 className="font-display uppercase text-[28px] leading-none mb-4">{s.title}</h3>
                <p className="text-muted leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section className="bg-surface border-y border-border">
        <div className={`${wrap} py-16 sm:py-24`}>
          <H2 className="mb-4">One list. Every deadline.</H2>
          <p className="text-lg text-muted mb-10 max-w-2xl">Every renewal, cost and deadline in one view. Here&apos;s an example of what your finance and tech leads will see.</p>
          <div className="bg-panel rounded-[34px] p-3 sm:p-5">
            <div className="bg-surface rounded-[26px] overflow-hidden">
              <div className="bg-primary text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
                <p className="font-bold">Renewals · Example group</p>
                <p className="font-bold uppercase text-sm">Illustrative</p>
              </div>
              <div className="p-4 sm:p-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6 mb-8">
                  {[['Monthly spend', '£1,463'], ['Annual run rate', '£17,556'], ['Notice deadlines, 90 days', '5'], ['Tools tracked', '9']].map(([l, v]) => (
                    <div key={l}>
                      <p className="font-mono text-xs uppercase tracking-[0.04em] text-primary mb-2">{l}</p>
                      <p className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-primary leading-none">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="bg-bg rounded-[22px] p-5">
                    <p className="font-mono text-xs uppercase tracking-[0.04em] text-primary mb-3">Next notice deadlines</p>
                    <ul className="space-y-2">
                      {DEADLINES.map(d => (
                        <li key={d.name} className="bg-surface rounded-xl flex items-center justify-between px-4 py-3 text-lg">
                          {d.name}
                          <span className={`font-mono text-sm rounded-full w-14 text-center py-1 ${d.tone}`}>{d.days}d</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-bg rounded-[22px] p-5">
                    <p className="font-mono text-xs uppercase tracking-[0.04em] text-primary mb-4">Spend by category, monthly</p>
                    <ul className="space-y-4">
                      {SPEND.map(s => (
                        <li key={s.label} className="grid grid-cols-[100px_1fr_52px] sm:grid-cols-[120px_1fr_60px] items-center gap-3 text-sm sm:text-base">
                          <span>{s.label}</span>
                          <span className="h-3 rounded-full bg-surface"><span className="block h-3 rounded-full bg-primary" style={{ width: `${(s.value / 520) * 100}%` }} /></span>
                          <span className="font-mono text-right">£{s.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stacked Intelligence */}
      <section className="bg-night text-white">
        <div className={`${wrap} py-16 sm:py-24 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center`}>
          <div>
            <Eyebrow className="text-primary-tint">Backed by Stacked Intelligence</Eyebrow>
            <H2 className="mb-5">Renew,<br />renegotiate<br />or switch.</H2>
            <p className="text-lg sm:text-xl text-white/80 mb-8">When a notice period opens, we help you decide what to do.</p>
            <ul className="space-y-5">
              {[
                { icon: 'check', title: 'Stack Score', body: 'How the supplier scores across operators.' },
                { icon: 'people', title: 'Verified operator reviews', body: 'What operators say, including where it falls short.' },
                { icon: 'shield', title: 'Negotiation support', body: 'Our team helps you renegotiate or switch in time.' },
              ].map(f => (
                <li key={f.title} className="flex items-center gap-4">
                  <Sticker name={f.icon} size={52} />
                  <div>
                    <p className="text-lg font-bold">{f.title}</p>
                    <p className="text-white/70">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="bg-primary rounded-[34px] p-3 sm:p-4">
              <div className="bg-surface text-ink rounded-[26px] p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.04em] text-primary mb-1">POS · £520 a month</p>
                    <p className="font-display uppercase text-3xl leading-none">Lightspeed</p>
                  </div>
                  <span className="font-mono text-sm bg-negative-tint text-negative-dark rounded-full px-3 py-1.5 whitespace-nowrap">Notice in 11d</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-bg rounded-[18px] p-4"><p className="font-mono text-xs uppercase text-primary mb-1">Stack Score</p><p className="text-4xl font-bold tracking-[-0.04em] text-primary">72<span className="text-lg text-dim">/100</span></p></div>
                  <div className="bg-bg rounded-[18px] p-4"><p className="font-mono text-xs uppercase text-primary mb-1">Operator rating</p><p className="text-4xl font-bold tracking-[-0.04em] text-primary">4.1<span className="text-lg text-dim">/5</span></p></div>
                </div>
                <p className="font-mono text-xs uppercase text-primary mb-2">Integration health</p>
                <div className="flex flex-wrap gap-2 mb-6 text-sm">
                  <span className="rounded-full bg-positive-tint text-positive px-3 py-1">Xero</span>
                  <span className="rounded-full bg-positive-tint text-positive px-3 py-1">SevenRooms</span>
                  <span className="rounded-full bg-warning-tint text-warning-dark px-3 py-1">Planday</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a href={MARKETPLACE_URL} target="_blank" rel="noreferrer" className="rounded-full bg-primary hover:bg-primary-hover text-white px-5 py-2.5 text-sm font-bold uppercase">Compare alternatives</a>
                  <a href={ADVISORY_URL} target="_blank" rel="noreferrer" className="rounded-full border-2 border-primary text-primary px-5 py-2 text-sm font-bold uppercase">Get negotiation help</a>
                </div>
              </div>
            </div>
            <Stamp className="absolute -top-4 right-6" tilt={-3}>Illustrative</Stamp>
          </div>
        </div>
      </section>

      {/* Ask Renewals */}
      <section>
        <div className={`${wrap} py-16 sm:py-24 grid gap-12 lg:grid-cols-[1fr_1.1fr] items-center`}>
          <div>
            <H2 className="mb-5">Ask anything about your stack</H2>
            <p className="text-lg text-muted mb-8">Ask about your stack and spend. It drafts the cancellation email too.</p>
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-primary mb-3">Try asking</p>
            <div className="flex flex-col items-start gap-3">
              {['When is my POS due for renewal?', 'What am I paying for twice?', 'How do operators rate my booking system?'].map(q => (
                <span key={q} className="bg-surface border border-border rounded-full px-5 py-2.5">{q}</span>
              ))}
            </div>
          </div>
          <div className="bg-primary rounded-[34px] p-3 sm:p-4">
            <div className="bg-surface rounded-[26px] p-5 sm:p-7 space-y-4">
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.06em] text-primary pb-1">
                <span>✦ Ask Renewals</span><span>Example group</span>
              </div>
              <div className="flex justify-end">
                <p className="bg-primary text-white rounded-[18px] rounded-br-[4px] px-5 py-3.5 max-w-[85%]">Which notice deadlines do I need to act on this month?</p>
              </div>
              <div className="bg-surface-2 rounded-[18px] rounded-bl-[4px] p-5 max-w-[92%] space-y-3">
                <p>Two this month:</p>
                {[['Leat', '12 Oct 2026'], ['Lightspeed', '18 Oct 2026']].map(([n, d]) => (
                  <div key={n} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <span className="font-bold">{n}</span>
                    <span className="font-mono text-sm text-primary">Notice by {d}</span>
                  </div>
                ))}
                <p>Want me to draft the cancellation email for Leat?</p>
                <span className="inline-block rounded-full bg-flame text-white px-4 py-1.5 text-sm font-bold">Draft email</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Close */}
      <section id="start" className="bg-night text-white scroll-mt-4">
        <div className={`${wrap} py-16 sm:py-24 grid gap-12 lg:grid-cols-2 items-center`}>
          <div>
            <h2 className="font-display uppercase text-[56px] sm:text-7xl lg:text-8xl leading-[0.92] tracking-[-0.03em] mb-8">Stop renewing by default</h2>
            <p className="text-lg text-white/80 mb-6">Free. Five minutes. No fees, no catch.</p>
            <div className="flex items-center gap-3 text-white/70">
              <Sticker name="shield" size={40} />
              <p>Your costs and contracts stay private. Never shared with suppliers.</p>
            </div>
          </div>
          <SignInCard />
        </div>
      </section>

      <footer className="bg-night border-t border-white/10 text-white/60 text-sm">
        <div className={`${wrap} py-6 flex flex-wrap gap-x-6 gap-y-3 items-center justify-between`}>
          <span className="flex items-center gap-3"><StackedLogo className="h-5 w-auto" /> © 2026 Stacked</span>
          <span className="flex gap-5">
            <a href={MARKETPLACE_URL} className="hover:text-white">Marketplace</a>
            <a href={ADVISORY_URL} className="hover:text-white">Advisory</a>
            <a href="https://www.wearestacked.io/privacy" className="hover:text-white">Privacy</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

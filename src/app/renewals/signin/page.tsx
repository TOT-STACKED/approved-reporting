'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// The front page of renewals.wearestacked.io: the launch story (from the CFO
// dinner deck) with sign-in and sign-up built in at the top and bottom. Open
// to anyone. Existing members and venues with an Intelligence Review go
// straight in, and anyone new does the review as part of signing up (see
// /renewals/start).

const ICON = (name: string) => `/renewals-assets/${name}.png`;
const MARKETPLACE_URL = 'https://www.wearestacked.io/marketplace';
const ADVISORY_URL = 'https://www.wearestacked.io/advisory';

function Sticker({ name, size = 56, tilt = 0, className = '' }: { name: string; size?: number; tilt?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ICON(name)} alt="" width={size} height={size} className={`select-none shrink-0 ${className}`} style={{ transform: `rotate(${tilt}deg)` }} />
  );
}

function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`font-mono text-xs sm:text-sm uppercase tracking-[0.08em] mb-3 ${className}`}>{children}</p>;
}

function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`font-display uppercase text-[34px] sm:text-5xl lg:text-6xl leading-[0.92] ${className}`}>{children}</h2>;
}

/** Two-step email code form. Used in the hero and again at the bottom. */
function SignInCard({ dark = false }: { dark?: boolean }) {
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

  const input = 'w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20';
  const btn = 'w-full bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-50 text-white rounded-full px-5 py-3 text-sm font-semibold transition-colors';

  return (
    <div className={`bg-surface rounded-[28px] p-6 sm:p-8 ${dark ? 'border-[6px] border-primary' : 'border border-border shadow-[0_8px_0_0_rgba(56,39,143,0.12)]'}`}>
      <h3 className="font-display uppercase text-2xl mb-2">Sign in or sign up</h3>
      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-3">
          <p className="text-sm text-muted leading-relaxed">Enter your work email and we&apos;ll send a six-digit code. No password.</p>
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourvenue.com" className={input} aria-label="Work email" />
          {error && <p className="text-sm text-negative-dark">{error}</p>}
          <button type="submit" disabled={busy} className={btn}>{busy ? 'Sending…' : 'Get started free'}</button>
          <p className="text-xs text-dim">Done an Intelligence Review? Use the same email and we&apos;ll bring your stack in.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-muted leading-relaxed">We&apos;ve sent a code to <strong className="text-ink">{email}</strong>. It expires in 10 minutes.</p>
          <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className={`${input} text-lg tracking-[0.4em] font-mono`} aria-label="Six-digit code" />
          {error && <p className="text-sm text-negative-dark">{error}</p>}
          <button type="submit" disabled={busy || code.length < 6} className={btn}>{busy ? 'Checking…' : 'Continue'}</button>
          <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full text-sm text-muted underline">
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}

const STATS = [
  { value: '87%', label: 'of software spend is renewals', source: 'Zylo, 2026', bg: 'bg-series-2', ink: 'text-[#7A1040]' },
  { value: '54%', label: 'of software licences actually get used', source: 'Zylo, 2026', bg: 'bg-series-3', ink: 'text-[#2B4F8F]' },
  { value: '25%+', label: 'overspend without a central view of software', source: 'Gartner, through 2027', bg: 'bg-series-4', ink: 'text-[#2A400A]' },
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
  { label: 'POS', value: 520, color: 'bg-series-1' },
  { label: 'Workforce', value: 410, color: 'bg-series-2' },
  { label: 'Reservations', value: 233, color: 'bg-series-3' },
  { label: 'Loyalty', value: 180, color: 'bg-series-4' },
  { label: 'Accounting', value: 120, color: 'bg-series-5' },
];

export default function RenewalsLandingPage() {
  const wrap = 'max-w-6xl mx-auto px-4 sm:px-8';
  return (
    <div className="text-ink">
      {/* Hero */}
      <section className="bg-series-7">
        <header className={`${wrap} h-16 sm:h-20 flex items-center justify-between`}>
          <Link href="/renewals" className="flex items-baseline gap-2">
            <span className="font-display uppercase text-2xl">Stacked</span>
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">Renewals</span>
          </Link>
          <a href="#start" className="text-sm font-medium underline underline-offset-4">Sign in</a>
        </header>
        <div className={`${wrap} pt-8 pb-16 sm:pt-14 sm:pb-24 grid gap-10 lg:grid-cols-[1.25fr_1fr] items-center`}>
          <div>
            <h1 className="font-display uppercase text-[52px] sm:text-7xl lg:text-[88px] leading-[0.88] mb-6">
              Stacked<br />Renewals
            </h1>
            <p className="text-2xl sm:text-3xl font-medium mb-6">Never miss a notice period again.</p>
            <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed mb-8">
              Every tool your business pays for, what it costs, and the last day you can cancel before it auto-renews. One list, across every site. Free for hospitality operators.
            </p>
            <div className="hidden sm:flex items-center gap-4">
              <Sticker name="clock" size={72} tilt={-8} />
              <Sticker name="check" size={64} tilt={6} />
              <Sticker name="chart" size={68} tilt={-4} />
              <Sticker name="ticket" size={64} tilt={8} />
            </div>
          </div>
          <SignInCard />
        </div>
      </section>

      {/* The problem */}
      <section className="bg-bg">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow>The problem</Eyebrow>
          <H2 className="mb-10">Auto-renewals<br />nobody saw coming.</H2>
          <div className="bg-surface border border-border rounded-[28px] p-6 sm:p-10">
            <div className="hidden sm:grid grid-cols-[3fr_1fr_4fr] mb-3">
              <div><p className="font-mono text-sm text-muted">MONTH 0</p><p className="font-semibold text-lg">Contract starts</p></div>
              <div />
              <div><p className="font-mono text-sm text-muted">MONTH 12</p><p className="font-semibold text-lg">Auto-renews</p></div>
            </div>
            <div className="sm:hidden flex justify-between mb-2 text-xs">
              <p><span className="font-mono text-muted">MONTH 0</span><br /><span className="font-semibold">Contract starts</span></p>
              <p className="text-right"><span className="font-mono text-muted">MONTH 12</span><br /><span className="font-semibold">Auto-renews</span></p>
            </div>
            <div className="relative flex h-10 sm:h-12 rounded-full overflow-hidden text-xs sm:text-sm font-semibold whitespace-nowrap">
              <div className="bg-series-1 text-white flex items-center px-3 sm:px-5" style={{ width: '50%' }}>
                <span className="hidden sm:inline">12-month term</span>
              </div>
              <div className="bg-series-2 text-[#7A1040] flex items-center px-3 sm:px-5 flex-1">
                <span className="sm:hidden">+12 months</span>
                <span className="hidden sm:inline">Locked in for another 12 months</span>
              </div>
              <div className="absolute top-0 bottom-0 w-[3px] bg-negative" style={{ left: '37.5%' }} />
            </div>
            <div className="relative h-14 mt-3">
              <div className="absolute -translate-x-1/2 text-center" style={{ left: '37.5%' }}>
                <p className="font-mono text-sm text-negative">MONTH 9</p>
                <p className="font-semibold text-negative whitespace-nowrap">Notice deadline missed</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-8">
            <p className="font-display text-6xl sm:text-7xl text-negative leading-none">12.2%</p>
            <p className="text-lg">Average SaaS price rise at renewal, 4.5× general inflation. <span className="font-mono text-sm text-muted">Vertice</span></p>
          </div>
        </div>
      </section>

      {/* The numbers */}
      <section className="bg-bg border-t border-border">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow>The numbers</Eyebrow>
          <H2 className="mb-10">Renewals are where<br />the money goes.</H2>
          <div className="grid gap-4 md:grid-cols-3">
            {STATS.map(s => (
              <div key={s.value} className={`${s.bg} ${s.ink} rounded-[28px] p-7 sm:p-8 min-h-[240px] flex flex-col`}>
                <p className="font-display text-6xl sm:text-7xl leading-none">{s.value}</p>
                <p className="text-xl font-semibold leading-snug mt-auto pt-10">{s.label}</p>
                <p className="font-mono text-sm mt-3 opacity-80">{s.source}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-series-1 text-white rounded-[28px] px-7 sm:px-10 py-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8">
            <p className="font-display text-4xl text-series-6 whitespace-nowrap">£50k → +£6k</p>
            <p className="text-base sm:text-lg leading-relaxed">Spend £50k a year on tech and 12% renewal inflation adds about £6k next year, for the same tools.</p>
          </div>
        </div>
      </section>

      {/* What it does */}
      <section className="bg-series-6">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow>What it does</Eyebrow>
          <H2 className="mb-10">Your whole stack, one list.</H2>
          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-surface rounded-[28px] p-6 sm:p-8 flex items-center gap-6">
                <Sticker name={f.icon} size={84} />
                <div>
                  <h3 className="text-2xl font-bold leading-tight mb-2">{f.title}</h3>
                  <p className="text-muted leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-series-5">
        <div className={`${wrap} py-16 sm:py-24`}>
          <Eyebrow>How it works</Eyebrow>
          <H2 className="mb-10">Set up in minutes.</H2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { n: 1, title: 'Add your software', body: 'Upload contracts or add tools by hand. Done an Intelligence Review? Your stack is already in.' },
              { n: 2, title: 'We pull out the key dates', body: 'Notice periods, renewal dates and costs, read from the contract.' },
              { n: 3, title: 'Act before the deadline', body: 'Alerts, plus Stacked Intelligence on whether to renew.' },
            ].map(s => (
              <div key={s.n} className={`rounded-[28px] p-7 sm:p-8 min-h-[280px] flex flex-col ${s.n === 3 ? 'bg-series-1 text-white' : 'bg-surface'}`}>
                <span className={`w-14 h-14 rounded-full flex items-center justify-center font-display text-2xl ${s.n === 3 ? 'bg-series-7 text-ink' : 'bg-series-1 text-series-7'}`}>{s.n}</span>
                <h3 className="text-3xl font-bold leading-tight mt-auto pt-10 mb-3">{s.title}</h3>
                <p className={s.n === 3 ? 'text-white/80' : 'text-muted'}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section className="bg-series-3">
        <div className={`${wrap} py-16 sm:py-24`}>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <H2>One list.<br className="sm:hidden" /> Every deadline.</H2>
            <span className="font-mono text-sm bg-surface rounded-full px-4 py-2">ILLUSTRATIVE</span>
          </div>
          <div className="bg-surface rounded-[28px] p-4 sm:p-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
              {[['Monthly spend', '£1,463'], ['Annual run rate', '£17,556'], ['Notice deadlines, next 90 days', '5'], ['Tools tracked', '9']].map(([l, v]) => (
                <div key={l} className="bg-bg rounded-[18px] p-4 sm:p-5">
                  <p className="text-xs sm:text-sm text-muted mb-2 leading-snug">{l}</p>
                  <p className="font-display text-3xl sm:text-4xl leading-none">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border border-border rounded-[18px] p-5">
                <p className="font-semibold mb-3">Next notice deadlines</p>
                <ul className="divide-y divide-border">
                  {DEADLINES.map(d => (
                    <li key={d.name} className="flex items-center justify-between py-3 text-lg">
                      {d.name}
                      <span className={`font-mono text-sm rounded-full w-14 text-center py-1 ${d.tone}`}>{d.days}d</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border rounded-[18px] p-5">
                <p className="font-semibold mb-4">Spend by category, monthly</p>
                <ul className="space-y-3">
                  {SPEND.map(s => (
                    <li key={s.label} className="grid grid-cols-[100px_1fr_52px] sm:grid-cols-[120px_1fr_60px] items-center gap-3 text-sm sm:text-base">
                      <span>{s.label}</span>
                      <span className="h-4 rounded-full bg-transparent"><span className={`block h-4 rounded-full ${s.color}`} style={{ width: `${(s.value / 520) * 100}%` }} /></span>
                      <span className="font-mono text-right">£{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stacked Intelligence */}
      <section className="bg-series-4 text-[#2A400A]">
        <div className={`${wrap} py-16 sm:py-24 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center`}>
          <div>
            <Eyebrow>Stacked Intelligence</Eyebrow>
            <H2 className="mb-5">Renew,<br />renegotiate<br />or switch.</H2>
            <p className="text-lg sm:text-xl mb-8">When a notice period opens, we help you decide what to do.</p>
            <ul className="space-y-5">
              {[
                { icon: 'check', title: 'Stack Score', body: 'How the supplier scores across operators.' },
                { icon: 'people', title: 'Verified operator reviews', body: 'What operators say, including where it falls short.' },
                { icon: 'shield', title: 'Negotiation support', body: 'Our team helps you renegotiate or switch in time.' },
              ].map(f => (
                <li key={f.title} className="flex items-center gap-4">
                  <Sticker name={f.icon} size={56} />
                  <div>
                    <p className="text-xl font-bold">{f.title}</p>
                    <p>{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="bg-surface text-ink rounded-[28px] p-6 sm:p-8 shadow-[0_8px_0_0_#2A400A]">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <p className="text-3xl font-bold">Lightspeed</p>
                  <p className="text-muted">POS · £520 a month</p>
                </div>
                <span className="font-mono text-sm bg-negative-tint text-negative-dark rounded-full px-3 py-1.5 whitespace-nowrap">Notice in 11d</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-bg rounded-[18px] p-4"><p className="text-sm text-muted mb-1">Stack Score</p><p className="font-display text-4xl">72<span className="text-lg">/100</span></p></div>
                <div className="bg-bg rounded-[18px] p-4"><p className="text-sm text-muted mb-1">Operator rating</p><p className="font-display text-4xl">4.1<span className="text-lg">/5</span></p></div>
              </div>
              <p className="font-semibold mb-2">Integration health</p>
              <div className="flex flex-wrap gap-2 mb-6 text-sm">
                <span className="rounded-full bg-positive-tint text-positive px-3 py-1">Xero</span>
                <span className="rounded-full bg-positive-tint text-positive px-3 py-1">SevenRooms</span>
                <span className="rounded-full bg-warning-tint text-warning-dark px-3 py-1">Planday</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <a href={MARKETPLACE_URL} target="_blank" rel="noreferrer" className="rounded-full bg-series-1 text-white px-5 py-2.5 text-sm font-semibold">Compare alternatives</a>
                <a href={ADVISORY_URL} target="_blank" rel="noreferrer" className="rounded-full border-2 border-series-1 px-5 py-2 text-sm font-semibold">Get negotiation help</a>
              </div>
            </div>
            <p className="font-mono text-sm mt-4">ILLUSTRATIVE</p>
          </div>
        </div>
      </section>

      {/* Ask Renewals */}
      <section className="bg-series-2">
        <div className={`${wrap} py-16 sm:py-24 grid gap-12 lg:grid-cols-[1fr_1.1fr] items-center`}>
          <div>
            <Eyebrow>Ask Renewals</Eyebrow>
            <H2 className="mb-5">Just ask.</H2>
            <p className="text-lg sm:text-xl mb-8">Ask about your stack and spend. It drafts the cancellation email too.</p>
            <div className="flex flex-col items-start gap-3">
              {['“When is my POS due for renewal?”', '“What am I paying for twice?”', '“How do operators rate my booking system?”'].map(q => (
                <span key={q} className="bg-surface rounded-full px-5 py-2.5">{q}</span>
              ))}
            </div>
          </div>
          <div className="bg-surface rounded-[28px] p-5 sm:p-8 space-y-4">
            <div className="flex justify-end">
              <p className="bg-series-1 text-white rounded-[18px] rounded-br-md px-5 py-4 max-w-[85%] text-lg">Which notice deadlines do I need to act on this month?</p>
            </div>
            <div className="bg-bg rounded-[18px] rounded-bl-md p-5 max-w-[92%] space-y-3">
              <p className="text-lg">Two this month:</p>
              {[['Leat', '12 Oct 2026'], ['Lightspeed', '18 Oct 2026']].map(([n, d]) => (
                <div key={n} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <span className="font-bold">{n}</span>
                  <span className="font-mono text-sm">Notice by {d}</span>
                </div>
              ))}
              <p className="text-lg">Want me to draft the cancellation email for Leat?</p>
              <span className="inline-block rounded-full border-2 border-series-1 px-5 py-2 font-semibold">Draft email</span>
            </div>
          </div>
        </div>
      </section>

      {/* Close */}
      <section id="start" className="bg-series-1 text-white scroll-mt-4">
        <div className={`${wrap} py-16 sm:py-24 grid gap-12 lg:grid-cols-2 items-center`}>
          <div>
            <h2 className="font-display uppercase text-[56px] sm:text-7xl lg:text-8xl leading-[0.9] mb-8">Free.<br />Five<br />minutes.<br />Today.</h2>
            <p className="font-mono text-xl sm:text-2xl text-series-6 mb-6">renewals.wearestacked.io</p>
            <div className="flex items-center gap-3 text-white/80">
              <Sticker name="shield" size={40} />
              <p>Your costs and contracts stay private. Never shared with suppliers.</p>
            </div>
          </div>
          <div className="text-ink">
            <SignInCard dark />
          </div>
        </div>
      </section>

      <footer className="bg-series-1 border-t border-white/10 text-white/60 text-sm">
        <div className={`${wrap} py-6 flex flex-wrap gap-x-6 gap-y-2 justify-between`}>
          <span>© Stacked</span>
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

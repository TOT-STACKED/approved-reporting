'use client';

import { useState } from 'react';
import Link from 'next/link';
import VenuesHeader from '@/components/venues/VenuesHeader';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PLANS,
  TOPUP_PENCE,
  TOPUP_REVEALS,
  gbp,
  starterPricePence,
  type Category,
} from '@/lib/venue-plans';

type Plan = 'starter' | 'bundle';

export default function JoinPage() {
  const [plan, setPlan] = useState<Plan>('starter');
  const [cats, setCats] = useState<Category[]>(['pos']);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const starterTotal = starterPricePence(cats.length);
  // Past this point the Bundle is the better deal, so say so.
  const bundleIsCheaper = plan === 'starter' && starterTotal >= PLANS.bundle.pricePence;

  function toggle(c: Category) {
    setCats(cur => (cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]));
  }

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/venues/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, categories: cats, email, name, company }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || 'Could not start checkout.');
        return;
      }
      window.location.href = json.url;
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const card = (active: boolean) =>
    `text-left flex flex-col justify-start rounded-[22px] p-5 border-2 transition-colors ${
      active ? 'border-brand-green bg-surface' : 'border-border bg-surface hover:border-brand-lavender'
    }`;

  return (
    <div className="min-h-screen bg-bg">
      <VenuesHeader right={<Link href="/venues/signin" className="text-sm underline">Sign in</Link>} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="font-display text-3xl sm:text-5xl mb-3">Pick a plan</h1>
        <p className="text-muted mb-8 max-w-2xl">
          A reveal shows a venue&apos;s name and the tech it uses in your categories. Revealed venues stay
          unlocked while you subscribe. Unused reveals don&apos;t roll over. Cancel any time.
          Already subscribed? A new plan here replaces your current one, and the old one is
          cancelled with a prorated credit.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          <button type="button" onClick={() => setPlan('starter')} className={card(plan === 'starter')}>
            <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Starter</p>
            <p className="font-display text-4xl mb-2">
              {gbp(PLANS.starter.pricePence)}<span className="text-lg text-dim">/mo</span>
            </p>
            <ul className="text-sm space-y-1 text-muted">
              <li>{PLANS.starter.reveals} venue reveals a month</li>
              <li>1 category included</li>
              <li>+{gbp(1000)}/mo per extra category</li>
            </ul>
          </button>
          <button type="button" onClick={() => setPlan('bundle')} className={card(plan === 'bundle')}>
            <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Bundle</p>
            <p className="font-display text-4xl mb-2">
              {gbp(PLANS.bundle.pricePence)}<span className="text-lg text-dim">/mo</span>
            </p>
            <ul className="text-sm space-y-1 text-muted">
              <li>{PLANS.bundle.reveals} venue reveals a month</li>
              <li>All {CATEGORIES.length} categories</li>
              <li>How each venue rates its tools, out of 10</li>
              <li>Gaps: categories where a venue has no tool at all</li>
              <li>Filter for venues unhappy with a competitor</li>
            </ul>
          </button>
        </div>

        <form onSubmit={checkout} className="bg-surface border border-border rounded-[22px] p-5 sm:p-7 space-y-6">
          {plan === 'starter' && (
            <div>
              <p className="text-xs font-semibold mb-3">Which categories do you want to see?</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    aria-pressed={cats.includes(c)}
                    className={`rounded-full px-3.5 py-1.5 text-sm border transition-colors ${
                      cats.includes(c)
                        ? 'bg-brand-green text-white border-brand-green'
                        : 'bg-surface border-border hover:bg-brand-cream'
                    }`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
              {bundleIsCheaper && (
                <p className="text-sm mt-3 text-muted">
                  The Bundle gets you every category, 5× the reveals and the scores for{' '}
                  {gbp(PLANS.bundle.pricePence)}.{' '}
                  <button type="button" onClick={() => setPlan('bundle')} className="underline">Switch to Bundle</button>
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold sm:col-span-3">
              <span className="block mb-2">Work email (you&apos;ll sign in with this)</span>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourcompany.com"
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold">
              <span className="block mb-2">Your name</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold sm:col-span-2">
              <span className="block mb-2">Company</span>
              <input
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm font-normal"
              />
            </label>
          </div>

          {error && <p className="text-sm text-negative-dark">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm">
              <span className="font-display text-2xl">
                {gbp(plan === 'bundle' ? PLANS.bundle.pricePence : starterTotal)}
              </span>
              <span className="text-muted"> a month, billed by Stripe</span>
            </p>
            <button
              type="submit"
              disabled={busy || (plan === 'starter' && cats.length === 0)}
              className="bg-brand-orange hover:bg-orange-400 active:bg-orange-600 disabled:opacity-50 text-brand-green rounded-full px-6 py-3 text-sm font-medium shadow-[4px_4px_0_0_#C34014] transition-colors"
            >
              {busy ? 'Opening checkout…' : 'Continue to payment'}
            </button>
          </div>
        </form>

        <p className="text-sm text-muted mt-6">
          Need more in a month? Top up {TOPUP_REVEALS} reveals for {gbp(TOPUP_PENCE)} any time.
          Approved partners get the Bundle included: just{' '}
          <Link href="/venues/signin" className="underline">sign in</Link> with your partner email.
        </p>
      </main>
    </div>
  );
}

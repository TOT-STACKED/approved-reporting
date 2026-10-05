'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import VenuesHeader from './VenuesHeader';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  TOPUP_REVEALS,
  UNHAPPY_MAX,
  VENUE_TYPE_LABELS,
  gbp,
  TOPUP_PENCE,
  type Category,
} from '@/lib/venue-plans';
import type { VenueCard } from '@/lib/venues';
import type { ViewerSummary } from '@/lib/venue-viewer';

interface Payload {
  viewer: ViewerSummary | null;
  signedInAs: string | null;
  venues: VenueCard[];
  total: number;
}

const btnPrimary =
  'bg-brand-orange hover:bg-orange-400 active:bg-orange-600 disabled:opacity-50 text-brand-green rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap shadow-[3px_3px_0_0_#C34014] transition-colors';
const btnGhost =
  'border border-border bg-surface hover:bg-brand-cream rounded-full px-4 py-2 text-sm whitespace-nowrap text-brand-green transition-colors';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function sitesLabel(s: string): string {
  if (!s) return '';
  return s === '1' ? '1 site' : `${s} sites`;
}

export default function VenueMarketplace() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    params.get('welcome') ? 'You’re in. Reveal a venue to see its name and stack.' :
    params.get('topup') ? `Top-up received — ${TOPUP_REVEALS} more reveals are on their way to your account.` : ''
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [tool, setTool] = useState('');
  const [unhappy, setUnhappy] = useState(false);
  const [revealedOnly, setRevealedOnly] = useState(false);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (type) sp.set('type', type);
    if (q) sp.set('q', q);
    if (tool) sp.set('tool', tool);
    if (unhappy) sp.set('unhappy', '1');
    if (revealedOnly) sp.set('revealed', '1');
    try {
      const res = await fetch(`/api/venues?${sp}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load venues.');
      setData(json);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load venues.');
    }
  }, [type, q, tool, unhappy, revealedOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function reveal(id: string) {
    setBusyId(id);
    setNotice('');
    try {
      const res = await fetch('/api/venues/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.outOfReveals ? `You’ve used this month’s reveals. Top up ${TOPUP_REVEALS} for ${gbp(TOPUP_PENCE)}.` : json.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function goTo(endpoint: string, body?: object) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else setNotice(json.error || 'Something went wrong.');
  }

  async function signOut() {
    await fetch('/api/venues/logout', { method: 'POST' });
    router.refresh();
    setData(null);
    load();
  }

  const viewer = data?.viewer || null;
  const left = viewer ? Math.max(0, viewer.allowance - viewer.used) : 0;
  const myCats: Category[] = viewer?.categories || [];

  return (
    <div className="min-h-screen bg-bg">
      <VenuesHeader
        right={
          viewer || data?.signedInAs ? (
            <>
              <span className="hidden sm:inline text-muted">{viewer?.email || data?.signedInAs}</span>
              <button onClick={signOut} className={btnGhost}>Sign out</button>
            </>
          ) : (
            <>
              <Link href="/venues/signin" className={btnGhost}>Sign in</Link>
              <Link href="/venues/join" className={btnPrimary}>See plans</Link>
            </>
          )
        }
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {!viewer ? (
          <section className="bg-brand-yellow rounded-[28px] p-6 sm:p-10 mb-8">
            <p className="text-xs uppercase tracking-[0.12em] text-muted mb-3">For tech partners</p>
            <h1 className="font-display text-3xl sm:text-5xl mb-4 max-w-3xl">
              See which UK venues run which tech
            </h1>
            <p className="text-base text-muted max-w-2xl mb-6 leading-relaxed">
              {data ? `${data.total} hospitality venues` : 'Hundreds of hospitality venues'} have told
              Stacked exactly what they use for POS, payments, workforce, inventory and more, and agreed
              to be listed. Browse them free. Reveal the ones you want to know about from {gbp(1000)} a
              month.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/venues/join" className={btnPrimary}>See plans</Link>
              <Link href="/venues/signin" className={btnGhost}>I already subscribe</Link>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-3 mb-8">
            <div className="bg-surface border border-border rounded-[22px] p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Reveals left this month</p>
              <p className="font-display text-4xl">
                {left}
                <span className="text-lg text-dim"> / {viewer.allowance}</span>
              </p>
              {viewer.bonus > 0 && <p className="text-sm text-muted mt-1">+ {viewer.bonus} top-up reveals</p>}
            </div>
            <div className="bg-surface border border-border rounded-[22px] p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Your plan</p>
              <p className="font-display text-2xl mb-1">{viewer.planName}</p>
              <p className="text-sm text-muted">
                {myCats.length === CATEGORIES.length ? 'Every category' : myCats.map(c => CATEGORY_LABELS[c]).join(', ')}
                {viewer.insights && ' · scores & gaps'}
              </p>
              {viewer.status === 'past_due' && (
                <p className="text-sm text-negative-dark mt-2">Payment failed — update your card to keep revealing.</p>
              )}
            </div>
            <div className="bg-surface border border-border rounded-[22px] p-5 flex flex-col gap-2 justify-center">
              <button onClick={() => goTo('/api/venues/checkout', { topup: true })} className={btnPrimary}>
                Top up {TOPUP_REVEALS} reveals · {gbp(TOPUP_PENCE)}
              </button>
              {viewer.canManageBilling && (
                <button onClick={() => goTo('/api/venues/billing')} className={btnGhost}>Manage billing</button>
              )}
              {viewer.plan === 'starter' && (
                <Link href="/venues/join" className="text-sm text-center text-muted underline">Upgrade to Bundle</Link>
              )}
            </div>
          </section>
        )}

        {!viewer && data?.signedInAs && (
          <div className="mb-6 rounded-2xl bg-primary-wash border border-primary-tint px-4 py-3 text-sm">
            You&apos;re signed in as {data.signedInAs}, but there&apos;s no active plan on this email.{' '}
            <Link href="/venues/join" className="underline">Pick a plan</Link> to start revealing venues.
          </div>
        )}

        {notice && (
          <div className="mb-6 rounded-2xl bg-primary-wash border border-primary-tint px-4 py-3 text-sm">{notice}</div>
        )}

        {/* Filters */}
        <section className="flex flex-wrap items-end gap-3 mb-6">
          <label className="text-xs font-semibold">
            <span className="block mb-1">Venue type</span>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="bg-surface border border-border rounded-xl px-3 py-2 text-sm font-normal"
            >
              <option value="">All types</option>
              {Object.entries(VENUE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            <span className="block mb-1">Location</span>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="e.g. Manchester"
              className="bg-surface border border-border rounded-xl px-3 py-2 text-sm font-normal w-44"
            />
          </label>
          {viewer && (
            <label className="text-xs font-semibold">
              <span className="block mb-1">Uses a tool</span>
              <input
                value={tool}
                onChange={e => setTool(e.target.value)}
                placeholder="e.g. Lightspeed"
                className="bg-surface border border-border rounded-xl px-3 py-2 text-sm font-normal w-44"
              />
            </label>
          )}
          {viewer?.insights && (
            <label className="flex items-center gap-2 text-sm bg-surface border border-border rounded-xl px-3 py-2">
              <input type="checkbox" checked={unhappy} onChange={e => setUnhappy(e.target.checked)} />
              Unhappy with their tool (score ≤ {UNHAPPY_MAX})
            </label>
          )}
          {viewer && (
            <label className="flex items-center gap-2 text-sm bg-surface border border-border rounded-xl px-3 py-2">
              <input type="checkbox" checked={revealedOnly} onChange={e => setRevealedOnly(e.target.checked)} />
              Revealed only
            </label>
          )}
          {data && <p className="text-sm text-muted ml-auto">{data.venues.length} venues</p>}
        </section>

        {error && <p className="text-sm text-negative-dark mb-6">{error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading venues…</p>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.venues.map(v => (
            <article key={v.id} className="bg-surface border border-border rounded-[22px] p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  {v.locked ? (
                    <p className="font-semibold text-dim flex items-center gap-1.5">
                      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="9" width="12" height="8" rx="2" />
                        <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
                      </svg>
                      Hidden venue
                    </p>
                  ) : (
                    <p className="font-semibold text-lg leading-tight break-words">{v.name}</p>
                  )}
                  <p className="text-sm text-muted mt-1">
                    {[VENUE_TYPE_LABELS[v.venueType] || v.venueType, sitesLabel(v.sites), v.location].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="font-mono text-xs text-dim shrink-0">{fmtDate(v.reviewedAt)}</span>
              </div>

              {v.locked ? (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {v.covered.map(c => (
                      <span
                        key={c}
                        className={`text-xs rounded-full px-2.5 py-1 ${
                          myCats.includes(c) ? 'bg-brand-lavender text-brand-green' : 'bg-brand-cream text-dim'
                        }`}
                      >
                        {CATEGORY_LABELS[c]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto">
                    {viewer ? (
                      <button onClick={() => reveal(v.id)} disabled={busyId === v.id} className={`${btnPrimary} w-full`}>
                        {busyId === v.id ? 'Revealing…' : 'Reveal venue'}
                      </button>
                    ) : (
                      <Link href="/venues/join" className={`${btnGhost} block text-center`}>Subscribe to reveal</Link>
                    )}
                  </div>
                </>
              ) : (
                <dl className="space-y-2 text-sm">
                  {myCats.map(c => {
                    const tools = v.stack?.[c];
                    return (
                      <div key={c} className="flex gap-3">
                        <dt className="w-28 shrink-0 text-muted">{CATEGORY_LABELS[c]}</dt>
                        <dd className="min-w-0">
                          {tools && tools.length ? (
                            tools.map(t => (
                              <span key={t.name} className="mr-2 inline-flex items-baseline gap-1">
                                <span className="font-medium">{t.name}</span>
                                {t.score !== null && (
                                  <span
                                    className={`font-mono text-xs ${t.score <= UNHAPPY_MAX ? 'text-negative-dark' : 'text-dim'}`}
                                    title="How they rated it, out of 10"
                                  >
                                    {t.score}/10
                                  </span>
                                )}
                              </span>
                            ))
                          ) : (
                            <span className="text-dim">None</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                  {v.gaps && v.gaps.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border">
                      <dt className="text-xs uppercase tracking-[0.12em] text-muted mb-1">No tool yet for</dt>
                      <dd>{v.gaps.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              )}
            </article>
          ))}
        </section>

        {data && data.venues.length === 0 && (
          <p className="text-sm text-muted">No venues match those filters.</p>
        )}

        <p className="text-xs text-dim mt-10 max-w-2xl leading-relaxed">
          Every venue listed chose to share its tech stack through a Stacked Intelligence review. We never
          share contact details. To work with a venue, talk to the Stacked team.
        </p>
      </main>
    </div>
  );
}

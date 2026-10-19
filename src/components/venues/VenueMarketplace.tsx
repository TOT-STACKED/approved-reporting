'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import VenuesHeader from './VenuesHeader';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  TOPUP_PENCE,
  TOPUP_TOKENS,
  UNHAPPY_MAX,
  VENUE_TYPE_LABELS,
  gbp,
  type Category,
} from '@/lib/venue-plans';
import { UPGRADE_URL } from '@/lib/partner-tier';
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

function nextResetLabel(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
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
    params.get('topup') === '1' ? `Payment received. ${TOPUP_TOKENS} extra tokens added to your account.` :
    params.get('topup') ? `Payment received. Your ${TOPUP_TOKENS} extra tokens will show here within a minute or two. Refresh to check.` : ''
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState(false);

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
        setNotice(json.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveCategories() {
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/venues/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: picks }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error || 'Could not save your categories.');
        return;
      }
      setPicks([]);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function buyTokens() {
    setBuying(true);
    setNotice('');
    try {
      const res = await fetch('/api/venues/topup', { method: 'POST' });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setNotice([json.error || 'Could not start checkout.', json.detail].filter(Boolean).join(' — '));
    } catch {
      setNotice('Could not reach the server. Try again.');
    }
    setBuying(false);
  }

  function togglePick(c: Category) {
    setPicks(cur => (cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]));
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
  const needsPick = Boolean(viewer && myCats.length === 0);
  const bonus = viewer?.bonus || 0;
  const outOfTokens = left === 0 && bonus === 0;
  const maxPicks = viewer?.maxCategories || 5;

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
              <Link href="/venues/join" className={btnGhost}>How it works</Link>
              <Link href="/venues/signin" className={btnPrimary}>Sign in</Link>
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
              to be listed. Browse them free. Promote partners reveal 5 venues a month, in the categories
              they pick.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/venues/signin" className={btnPrimary}>Sign in with your partner email</Link>
              <Link href="/venues/join" className={btnGhost}>How it works</Link>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 mb-8">
            <div className="bg-surface border border-border rounded-[22px] p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">Tokens left this month</p>
              <p className="font-display text-4xl">
                {left}
                <span className="text-lg text-dim"> / {viewer.allowance}</span>
              </p>
              <p className="text-sm text-muted mt-1">
                {bonus > 0 && <>+ {bonus} bought {bonus === 1 ? 'token' : 'tokens'} · </>}
                Resets on {nextResetLabel()}
              </p>
              <button onClick={buyTokens} disabled={buying} className={`${btnPrimary} mt-4`}>
                {buying ? 'Opening checkout…' : `Buy more tokens · ${TOPUP_TOKENS} for ${gbp(TOPUP_PENCE)}`}
              </button>
            </div>
            <div className="bg-surface border border-border rounded-[22px] p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">This month&apos;s categories</p>
              <p className="font-display text-2xl mb-1">{viewer.planName}</p>
              <p className="text-sm text-muted">
                {myCats.length ? myCats.map(c => CATEGORY_LABELS[c]).join(', ') : 'Not picked yet'}
                {viewer.insights && ' · scores & gaps'}
              </p>
            </div>
          </section>
        )}

        {needsPick && (
          <section className="bg-brand-yellow rounded-[28px] p-6 sm:p-8 mb-8">
            <h2 className="font-display text-2xl sm:text-3xl mb-2">Pick this month&apos;s categories</h2>
            <p className="text-sm text-muted max-w-2xl mb-5 leading-relaxed">
              Choose up to {maxPicks}. Your {viewer?.allowance} reveals this month show each venue&apos;s
              tools in these categories. Your pick is locked until {nextResetLabel()}, when you can choose again.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {CATEGORIES.map(c => {
                const on = picks.includes(c);
                const full = !on && picks.length >= maxPicks;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => togglePick(c)}
                    disabled={full}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-sm border transition-colors disabled:opacity-40 ${
                      on ? 'bg-brand-green text-white border-brand-green' : 'bg-surface border-border hover:bg-brand-cream'
                    }`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={saveCategories} disabled={saving || picks.length === 0} className={btnPrimary}>
                {saving ? 'Saving…' : 'Confirm categories'}
              </button>
              <span className="text-sm text-muted">{picks.length} of {maxPicks} picked</span>
            </div>
          </section>
        )}

        {!viewer && data?.signedInAs && (
          <div className="mb-6 rounded-2xl bg-primary-wash border border-primary-tint px-4 py-3 text-sm">
            You&apos;re signed in as {data.signedInAs}. Venues is part of the Promote package, and this
            email isn&apos;t on a Promote partner account.{' '}
            <a href={UPGRADE_URL} className="underline">See partner packages</a> or talk to the Stacked team.
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
                      <button
                        onClick={() => reveal(v.id)}
                        disabled={busyId === v.id || needsPick || outOfTokens}
                        className={`${btnPrimary} w-full`}
                      >
                        {busyId === v.id ? 'Revealing…' : needsPick ? 'Pick categories first' : outOfTokens ? 'No tokens left' : 'Reveal venue'}
                      </button>
                    ) : (
                      <Link href="/venues/join" className={`${btnGhost} block text-center`}>Promote partners only</Link>
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

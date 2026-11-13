'use client';

import { useMemo, useState } from 'react';
import {
  MIN_RATINGS,
  productKey,
  searchProducts,
  type ProductRating,
  type RatingsDirectory,
} from '@/lib/renewals-ratings-shared';

// "How operators rate them": operator ratings from Stacked Intelligence for the
// products an operator picks: what they use now, what they've been quoted, and
// anything they type in. No leaderboard: Stacked stays neutral, so this only
// ever shows products the operator chose to look at.

export interface RatingPick {
  /** A product in the directory. Absent for a product nobody has rated yet. */
  id?: string;
  label: string;
  /** Why it's here, e.g. "You use it" or "Quoted". */
  note?: string;
}

const MARKETPLACE_URL = 'https://www.wearestacked.io/marketplace';
const MAX_PICKS = 8;

export default function ProductRatings({
  dir,
  own,
  initial,
}: {
  dir: RatingsDirectory;
  /** The operator's own ratings from their Intelligence Review, by productKey. */
  own: Record<string, number>;
  initial: RatingPick[];
}) {
  const [picks, setPicks] = useState<RatingPick[]>(initial);
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(dir.products.map(p => [p.id, p])), [dir]);
  const results = useMemo(
    () => searchProducts(dir, q).filter(p => !picks.some(x => x.id === p.id)),
    [dir, q, picks]
  );

  function add(p: ProductRating) {
    setPicks(prev => (prev.some(x => x.id === p.id) ? prev : [...prev, { id: p.id, label: p.name }].slice(-MAX_PICKS)));
    setQ('');
  }

  function remove(i: number) {
    setPicks(prev => prev.filter((_, j) => j !== i));
  }

  if (!dir.products.length) return null;

  return (
    <section className="bg-surface border border-border rounded-[22px] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted">How operators rate them</h2>
        <span className="text-xs text-dim">Stacked Intelligence</span>
      </div>
      <p className="text-sm text-muted leading-relaxed mb-4 max-w-2xl">
        Average score out of 10 from operators who use each product, across {dir.reviews} Intelligence Reviews. Add any product to see how it compares.
      </p>

      <div className="relative mb-4 max-w-md">
        <label htmlFor="rating-search" className="sr-only">Add a product to compare</label>
        <input
          id="rating-search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results[0]) { e.preventDefault(); add(results[0]); }
            if (e.key === 'Escape') setQ('');
          }}
          placeholder="Add a product, e.g. Nory"
          autoComplete="off"
          className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
        {q.trim().length >= 2 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
            {results.length ? results.map(p => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg flex items-center justify-between gap-3"
              >
                <span><span className="font-medium">{p.name}</span> <span className="text-muted">· {p.categoryLabel}</span></span>
                <span className="font-mono text-xs text-muted shrink-0">{p.avg != null ? `${p.avg.toFixed(1)} · ${p.n}` : `${p.n} rating${p.n === 1 ? '' : 's'}`}</span>
              </button>
            )) : (
              <p className="px-3 py-2.5 text-sm text-muted">No operator ratings for &ldquo;{q.trim()}&rdquo; yet.</p>
            )}
          </div>
        )}
      </div>

      {picks.length === 0 ? (
        <p className="text-sm text-muted">Search for a product to see how operators rate it.</p>
      ) : (
        <ul className="divide-y divide-border">
          {picks.map((pick, i) => {
            const p = pick.id ? byId.get(pick.id) : undefined;
            const mine = own[productKey(p?.name || pick.label)];
            const catAvg = p ? dir.categoryAvg[p.category] : undefined;
            return (
              <li key={`${pick.id || pick.label}-${i}`} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium">{p?.name || pick.label}</span>
                    {p && <span className="ml-2 text-[11px] uppercase tracking-wide rounded-full bg-surface-2 px-2 py-0.5 text-muted">{p.categoryLabel}</span>}
                    {pick.note && <span className="ml-2 text-xs text-muted">{pick.note}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {p?.avg != null && <span className="font-mono text-lg leading-none">{p.avg.toFixed(1)}<span className="text-xs text-dim">/10</span></span>}
                    <button onClick={() => remove(i)} aria-label={`Remove ${p?.name || pick.label}`} className="text-muted hover:text-ink text-xl leading-none px-1">×</button>
                  </div>
                </div>
                {p?.avg != null ? (
                  <>
                    <div className="relative h-2 rounded-full bg-surface-2 mt-2 overflow-hidden" aria-hidden>
                      <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${p.avg * 10}%` }} />
                      {catAvg != null && <div className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `${catAvg * 10}%` }} />}
                    </div>
                    <p className="text-xs text-muted mt-1.5">
                      {p.n} operators · {p.topPct}% rate it 9 or 10{catAvg != null && ` · ${p.categoryLabel} average ${catAvg.toFixed(1)}`}
                      {mine != null && <> · <span className="text-ink">you rated it {mine}</span></>}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted mt-1">
                    {p
                      ? `${p.n} rating${p.n === 1 ? '' : 's'} so far: we show an average from ${MIN_RATINGS}.`
                      : 'No operator ratings in Stacked Intelligence yet.'}
                    {mine != null && <> · <span className="text-ink">you rated it {mine}</span></>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-dim mt-4 leading-relaxed">
        Scores come from operators, never suppliers, and we don&apos;t rank products. To see more in a category, browse the{' '}
        <a href={MARKETPLACE_URL} target="_blank" rel="noreferrer" className="underline">Stacked Marketplace</a>.
      </p>
    </section>
  );
}

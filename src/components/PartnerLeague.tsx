'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { POINTS } from '@/lib/partner-activity';

// The fun bit of the dashboard: who's moving. Every step forward on a lead
// (passed to the partner as an MQL, moved to SQL, Closed Won) is a "move" and
// scores points. Partners are ranked over a chosen period (this week, 4 weeks,
// 12 weeks) with arrows for places climbed since the period before, streaks
// for consecutive weeks with a move, and a "back from red" badge when a quiet
// partner moves again. Tap a partner to see their weekly form, how far they
// are from the one above, and their latest moves. The team board credits the
// Stacked lead owner for each move.

type Band = 'green' | 'amber' | 'red';
type Stage = 'MQL' | 'SQL' | 'Closed Won';

export interface LeagueMove {
  stage: Stage;
  date: string;
  business: string;
  owner: string;
}

export interface LeagueRow {
  name: string;
  slug: string;
  tier: string;
  band: Band;
  points30d: number;
  pointsPrev30d: number;
  sql30d: number;
  won30d: number;
  leads30d: number;
  streakWeeks: number;
  comeback: boolean;
  daysSinceLastLead: number | null;
  /** Points per week, index 0 = last 7 days. */
  weekly?: number[];
  moves30d?: LeagueMove[];
}

export interface FeedItem extends LeagueMove {
  partner: string;
  slug: string;
}

export interface TeamScore {
  owner: string;
  points30d: number;
  moves30d: number;
  sql30d: number;
  won30d: number;
}

const PERIODS = [
  { key: 'week', label: 'This week', weeks: 1, prevLabel: 'last week' },
  { key: 'month', label: '4 weeks', weeks: 4, prevLabel: 'the 4 weeks before' },
  { key: 'quarter', label: '12 weeks', weeks: 12, prevLabel: 'the 12 weeks before' },
] as const;
type PeriodKey = typeof PERIODS[number]['key'];

const STAGE_STYLE: Record<Stage, { label: string; cls: string }> = {
  MQL: { label: 'MQL', cls: 'bg-brand-sky text-brand-green' },
  SQL: { label: 'SQL', cls: 'bg-brand-lime text-brand-green' },
  'Closed Won': { label: 'WON', cls: 'bg-brand-green text-white' },
};

const MEDAL = ['bg-[#F5C542] text-[#5A4300]', 'bg-[#D9DDE3] text-[#3D434C]', 'bg-[#E3A36B] text-[#5A2F0C]'];

function when(iso: string, now: number): string {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function sum(a: number[] | undefined, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a?.[i] || 0;
  return s;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** What it takes to catch the partner above, in the language of moves. */
function chaseLine(gap: number, aboveName: string): string {
  const need = gap + 1;
  if (need <= POINTS.MQL) return `${gap === 0 ? 'Level' : `${gap} pt`} with ${aboveName}. One MQL takes the place.`;
  if (need <= POINTS.SQL) return `${gap} pts behind ${aboveName}. One SQL takes the place.`;
  if (need <= POINTS['Closed Won']) return `${gap} pts behind ${aboveName}. A win takes the place, or ${Math.ceil(need / POINTS.SQL)} SQLs.`;
  return `${gap} pts behind ${aboveName}. That's ${Math.ceil(need / POINTS.SQL)} SQLs, or ${Math.ceil(need / POINTS['Closed Won'])} wins.`;
}

/** Counts up (or down) to the value when it changes. Instant with reduced motion. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || prefersReducedMotion()) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let id = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <>{shown}</>;
}

function Flame({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1.1 2.5 2.5 2.5S15.5 10.9 15 9c2.4 1.6 4 4.3 4 7.2C19 19.9 15.9 22 12 22s-7-2.1-7-5.8C5 11.5 10.5 8.6 12 2z" />
    </svg>
  );
}

function Confetti({ burst }: { burst: number }) {
  // CSS-only, plays once per burst, and never for people who've asked for
  // less motion. Fires on load when there's been a win this week, and again
  // whenever someone taps the Wins tile.
  const colours = ['#FF5014', '#B0F070', '#90D8F0', '#FF90C0', '#F5C542', '#38278F'];
  return (
    <div key={burst} className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block w-1.5 h-2.5 rounded-sm league-confetti"
          style={{ left: `${(i * 47) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 7) * 0.1}s` }}
        />
      ))}
    </div>
  );
}

/** 12 weeks of points as little bars, oldest on the left; the chosen period is highlighted. */
function WeeklyBars({ weekly, highlight }: { weekly: number[]; highlight: number }) {
  const weeks = weekly.slice(0, 12);
  const max = Math.max(1, ...weeks);
  return (
    <div className="flex items-end gap-1 h-14" role="img" aria-label={`Points per week, last 12 weeks: ${[...weeks].reverse().join(', ')}`}>
      {[...weeks].reverse().map((v, i) => {
        const weekIndex = weeks.length - 1 - i;
        const on = weekIndex < highlight;
        return (
          <span key={i} className="flex-1 flex flex-col justify-end h-full" title={`${weekIndex === 0 ? 'This week' : `${weekIndex} week${weekIndex === 1 ? '' : 's'} ago`}: ${v} pts`}>
            <span
              className={`block rounded-t ${on ? 'bg-brand-green' : 'bg-brand-green/25'} league-bar`}
              style={{ height: `${v === 0 ? 4 : Math.max(8, (v / max) * 100)}%`, animationDelay: `${i * 25}ms` }}
            />
          </span>
        );
      })}
    </div>
  );
}

export default function PartnerLeague({
  rows, feed, team, hiddenSlugs,
}: { rows: LeagueRow[]; feed: FeedItem[]; team: TeamScore[]; hiddenSlugs: string[] }) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [now] = useState(() => Date.now());
  const p = PERIODS.find(x => x.key === period)!;

  const league = useMemo(() => {
    const hidden = new Set(hiddenSlugs);
    const list = rows
      .filter(r => r.tier === 'approved' && !hidden.has(r.slug))
      .map(r => {
        // Older API responses have no weekly history: fall back to the 30-day totals.
        const pts = r.weekly ? sum(r.weekly, 0, p.weeks) : r.points30d;
        const prev = r.weekly ? sum(r.weekly, p.weeks, p.weeks * 2) : r.pointsPrev30d;
        return { ...r, pts, prev };
      });
    const prevRank = new Map(
      [...list].sort((a, b) => b.prev - a.prev || a.name.localeCompare(b.name)).map((r, i) => [r.slug, i + 1]),
    );
    return [...list]
      .sort((a, b) => b.pts - a.pts || (a.daysSinceLastLead ?? 1e9) - (b.daysSinceLastLead ?? 1e9) || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, rank: i + 1, prevRank: prevRank.get(r.slug) ?? list.length }));
  }, [rows, hiddenSlugs, p.weeks]);

  // Slide rows to their new places when the order changes (FLIP).
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const lastTops = useRef(new Map<string, number>());
  const order = league.map(r => r.slug).join(',');
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const next = new Map<string, number>();
    rowRefs.current.forEach((el, slug) => {
      const top = el.getBoundingClientRect().top;
      next.set(slug, top);
      const before = lastTops.current.get(slug);
      if (reduce || before == null || before === top) return;
      el.animate(
        [{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
        { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    });
    lastTops.current = next;
  }, [order]);

  const approvedSlugs = useMemo(() => new Set(league.map(r => r.slug)), [league]);
  const weekFeed = feed.filter(f => approvedSlugs.has(f.slug));
  const weekSql = weekFeed.filter(f => f.stage === 'SQL').length;
  const weekWon = weekFeed.filter(f => f.stage === 'Closed Won').length;
  const comebacks = league.filter(r => r.comeback);
  const maxPts = Math.max(1, ...league.map(r => r.pts));
  const shown = showAll || open ? league.slice(0, Math.max(10, showAll ? league.length : (league.findIndex(r => r.slug === open) + 1))) : league.slice(0, 10);

  return (
    <section className="mb-8" aria-labelledby="league-heading">
      <style>{`
        @keyframes league-fall { 0% { transform: translateY(-10px) rotate(0); opacity: 1 } 100% { transform: translateY(170px) rotate(540deg); opacity: 0 } }
        .league-confetti { animation: league-fall 1.8s ease-in 1 forwards; }
        @keyframes league-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
        .league-bar { transform-origin: bottom; animation: league-grow .45s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes league-pop { 0% { transform: scale(.6) } 60% { transform: scale(1.25) } 100% { transform: scale(1) } }
        .league-pop { display: inline-block; animation: league-pop .5s ease-out both; }
        @keyframes league-open { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
        .league-open { animation: league-open .25s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .league-bar, .league-pop, .league-open { animation: none } }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 id="league-heading" className="text-lg font-bold text-brand-green">Partner League</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Points for every move: MQL {POINTS.MQL}, SQL {POINTS.SQL}, Won {POINTS['Closed Won']}. Tap a partner to see their form.
          </p>
        </div>
        <div role="tablist" aria-label="League period" className="inline-flex rounded-full bg-gray-100 p-1">
          {PERIODS.map(x => (
            <button
              key={x.key}
              role="tab"
              type="button"
              aria-selected={period === x.key}
              onClick={() => setPeriod(x.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold min-h-[32px] transition-colors ${period === x.key ? 'bg-white text-brand-green shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* This week */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {weekWon > 0 && <Confetti burst={burst} />}
        {[
          { n: weekFeed.length, label: 'Moves this week', cls: 'bg-brand-sky text-brand-green' },
          { n: weekSql, label: 'New SQLs', cls: 'bg-brand-lime text-brand-green' },
          { n: weekWon, label: weekWon === 1 ? 'Win' : 'Wins', cls: 'bg-brand-green text-white', onClick: weekWon > 0 ? () => setBurst(b => b + 1) : undefined },
          { n: comebacks.length, label: 'Back from red', cls: 'bg-brand-yellow text-brand-green' },
        ].map(t => {
          const body = (
            <>
              <p className="font-display text-4xl leading-none tabular-nums"><CountUp value={t.n} /></p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] mt-2 opacity-80">{t.label}</p>
            </>
          );
          return t.onClick ? (
            <button key={t.label} type="button" onClick={t.onClick} className={`rounded-2xl p-4 text-left active:scale-[.98] transition-transform ${t.cls}`} aria-label={`${t.n} ${t.label}. Celebrate`}>
              {body}
            </button>
          ) : (
            <div key={t.label} className={`rounded-2xl p-4 ${t.cls}`}>{body}</div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* League table */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <ol>
            {shown.map((r, i) => {
              const climb = r.prevRank - r.rank;
              const isNew = r.prev === 0 && r.pts > 0;
              const dot = r.band === 'green' ? 'bg-positive-bright' : r.band === 'amber' ? 'bg-warning' : 'bg-negative';
              const isOpen = open === r.slug;
              const above = i > 0 ? shown[i - 1] : null;
              const below = shown[i + 1];
              return (
                <li
                  key={r.slug}
                  ref={el => { if (el) rowRefs.current.set(r.slug, el); else rowRefs.current.delete(r.slug); }}
                  className={`relative border-b border-gray-100 last:border-0 bg-white ${isOpen ? 'z-10' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : r.slug)}
                    aria-expanded={isOpen}
                    className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${r.rank <= 3 && r.pts > 0 ? MEDAL[r.rank - 1] : 'bg-gray-100 text-gray-500'}`}>
                      {r.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
                        <span className="text-sm font-semibold text-gray-900 truncate">{r.name}</span>
                        {r.comeback && (
                          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-yellow text-brand-green" title="Back from red">
                            <span className="sm:hidden">Back</span><span className="hidden sm:inline">Back from red</span>
                          </span>
                        )}
                        {r.streakWeeks >= 2 && (
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#C2410C]" title={`${r.streakWeeks} weeks in a row with a move`}>
                            <Flame className="w-3 h-3" />{r.streakWeeks}w
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
                        <span className="block h-full rounded-full bg-brand-green/80 transition-[width] duration-500" style={{ width: `${(r.pts / maxPts) * 100}%` }} />
                      </span>
                    </span>
                    <span className="shrink-0 w-12 text-right">
                      <span className="block text-sm font-bold text-brand-green tabular-nums"><CountUp value={r.pts} /></span>
                      <span className="block text-[10px] text-gray-400">pts</span>
                    </span>
                    <span key={`${period}-${r.slug}`} className="shrink-0 w-9 text-right text-[11px] font-semibold tabular-nums" aria-label={isNew ? 'New entry' : climb > 0 ? `Up ${climb}` : climb < 0 ? `Down ${-climb}` : 'No change'}>
                      {isNew ? <span className="league-pop text-brand-green">NEW</span>
                        : climb > 0 ? <span className="league-pop text-positive">▲{climb}</span>
                        : climb < 0 ? <span className="text-negative">▼{-climb}</span>
                        : <span className="text-gray-300">–</span>}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="league-open px-3 sm:px-4 pb-4 pt-1 bg-gray-50">
                      <p className="text-[13px] font-semibold text-brand-green mb-2">
                        {r.rank === 1
                          ? below ? `Top of the table, ${r.pts - below.pts} pts clear of ${below.name}.` : 'Top of the table.'
                          : above ? chaseLine(above.pts - r.pts, above.name) : ''}
                      </p>
                      {r.weekly && (
                        <div className="mb-3">
                          <WeeklyBars weekly={r.weekly} highlight={p.weeks} />
                          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                            <span>12 weeks ago</span><span>This week</span>
                          </div>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-500 mb-1.5">
                        {r.pts} pts in {p.label.toLowerCase()} vs {r.prev} in {p.prevLabel}
                        {r.streakWeeks > 0 ? ` · ${r.streakWeeks}-week streak` : ''}
                      </p>
                      {(r.moves30d || []).length > 0 ? (
                        <ul className="space-y-1.5 mb-2">
                          {(r.moves30d || []).slice(0, 5).map((m, j) => (
                            <li key={j} className="flex items-center gap-2 text-[13px]">
                              <span className={`shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${STAGE_STYLE[m.stage].cls}`}>{STAGE_STYLE[m.stage].label}</span>
                              <span className="min-w-0 truncate text-gray-900">{m.business}</span>
                              <span className="shrink-0 ml-auto text-[11px] text-gray-400">{when(m.date, now)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[13px] text-gray-500 mb-2">No moves in the last 30 days.</p>
                      )}
                      <a href={`/partners/${r.slug}`} className="inline-flex items-center text-xs font-semibold text-brand-green hover:underline min-h-[32px]">
                        Open {r.name}&apos;s page →
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {league.length > 10 && (
            <button type="button" onClick={() => setShowAll(s => !s)} className="w-full text-center text-xs font-medium text-brand-green py-2.5 border-t border-gray-100 hover:bg-gray-50 min-h-[40px]">
              {showAll ? 'Show top 10' : `Show all ${league.length}`}
            </button>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {/* Latest moves */}
          <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-4">
            <h3 className="text-sm font-bold text-brand-green mb-2">Latest moves</h3>
            {weekFeed.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing has moved this week yet. First one on the board wins.</p>
            ) : (
              <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {weekFeed.slice(0, 15).map((f, i) => (
                  <li key={`${f.slug}-${f.business}-${f.stage}-${i}`} className="flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${STAGE_STYLE[f.stage].cls}`}>{STAGE_STYLE[f.stage].label}</span>
                    <span className="min-w-0 text-[13px] leading-snug">
                      <span className="font-semibold text-gray-900">{f.business}</span>
                      <span className="text-gray-500"> for </span>
                      <button type="button" onClick={() => { setOpen(f.slug); document.getElementById('league-heading')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); }} className="text-brand-green font-medium hover:underline">
                        {f.partner}
                      </button>
                      <span className="block text-[11px] text-gray-400">{f.owner} · {when(f.date, now)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Team board */}
          <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-4">
            <h3 className="text-sm font-bold text-brand-green">Team board</h3>
            <p className="text-[11px] text-gray-500 mb-2">Points for moves on leads you own, last 30 days.</p>
            {team.length === 0 ? (
              <p className="text-sm text-gray-500">No points on the board yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {team.slice(0, 6).map((t, i) => (
                  <li key={t.owner} className="flex items-center gap-2.5">
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i < 3 ? MEDAL[i] : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm text-gray-900 truncate">{t.owner}</span>
                    <span className="shrink-0 text-[11px] text-gray-500 tabular-nums">{t.sql30d} SQL · {t.won30d} won</span>
                    <span className="shrink-0 w-10 text-right text-sm font-bold text-brand-green tabular-nums"><CountUp value={t.points30d} /></span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

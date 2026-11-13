'use client';

import { useMemo, useState } from 'react';
import { POINTS } from '@/lib/partner-activity';

// The fun bit of the dashboard: who's moving. Every step forward on a lead
// (passed to the partner as an MQL, moved to SQL, Closed Won) is a "move" and
// scores points. Partners are ranked over the last 30 days, with arrows for how
// far they've climbed since the 30 days before, streaks for consecutive weeks
// with a move, and a "back from red" badge when a quiet partner moves again.
// The team board credits the Stacked lead owner for each move.

type Band = 'green' | 'amber' | 'red';

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
}

export interface FeedItem {
  stage: 'MQL' | 'SQL' | 'Closed Won';
  date: string;
  business: string;
  owner: string;
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

const STAGE_STYLE: Record<FeedItem['stage'], { label: string; cls: string }> = {
  MQL: { label: 'MQL', cls: 'bg-brand-sky text-brand-green' },
  SQL: { label: 'SQL', cls: 'bg-brand-lime text-brand-green' },
  'Closed Won': { label: 'WON', cls: 'bg-brand-green text-white' },
};

const MEDAL = ['bg-[#F5C542] text-[#5A4300]', 'bg-[#D9DDE3] text-[#3D434C]', 'bg-[#E3A36B] text-[#5A2F0C]'];

function when(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function Flame({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1.1 2.5 2.5 2.5S15.5 10.9 15 9c2.4 1.6 4 4.3 4 7.2C19 19.9 15.9 22 12 22s-7-2.1-7-5.8C5 11.5 10.5 8.6 12 2z" />
    </svg>
  );
}

function Confetti() {
  // CSS-only, plays once, and not at all for people who've asked for less
  // motion. Fired when there's been a win this week.
  const bits = Array.from({ length: 18 }, (_, i) => i);
  const colours = ['#FF5014', '#B0F070', '#90D8F0', '#FF90C0', '#F5C542', '#38278F'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {bits.map(i => (
        <span
          key={i}
          className="absolute top-0 block w-1.5 h-2.5 rounded-sm league-confetti"
          style={{
            left: `${(i * 53) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${(i % 6) * 0.12}s`,
            transform: `rotate(${i * 37}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes league-fall { 0% { transform: translateY(-10px) rotate(0); opacity: 1 } 100% { transform: translateY(170px) rotate(540deg); opacity: 0 } }
        .league-confetti { animation: league-fall 1.8s ease-in 1 forwards; }
      `}</style>
    </div>
  );
}

export default function PartnerLeague({
  rows, feed, team, hiddenSlugs,
}: { rows: LeagueRow[]; feed: FeedItem[]; team: TeamScore[]; hiddenSlugs: string[] }) {
  const [showAll, setShowAll] = useState(false);

  const league = useMemo(() => {
    const hidden = new Set(hiddenSlugs);
    const list = rows.filter(r => r.tier === 'approved' && !hidden.has(r.slug));
    const prevOrder = [...list].sort((a, b) => b.pointsPrev30d - a.pointsPrev30d || a.name.localeCompare(b.name));
    const prevRank = new Map(prevOrder.map((r, i) => [r.slug, i + 1]));
    return [...list]
      .sort((a, b) => b.points30d - a.points30d || (a.daysSinceLastLead ?? 1e9) - (b.daysSinceLastLead ?? 1e9) || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, rank: i + 1, prevRank: prevRank.get(r.slug) ?? list.length }));
  }, [rows, hiddenSlugs]);

  const approvedSlugs = useMemo(() => new Set(league.map(r => r.slug)), [league]);
  const weekFeed = feed.filter(f => approvedSlugs.has(f.slug));
  const weekSql = weekFeed.filter(f => f.stage === 'SQL').length;
  const weekWon = weekFeed.filter(f => f.stage === 'Closed Won').length;
  const comebacks = league.filter(r => r.comeback);
  const maxPts = Math.max(1, ...league.map(r => r.points30d));
  const shown = showAll ? league : league.slice(0, 10);

  return (
    <section className="mb-8" aria-labelledby="league-heading">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 id="league-heading" className="text-lg font-bold text-brand-green">Partner League</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Points for every move in the last 30 days: MQL {POINTS.MQL}, SQL {POINTS.SQL}, Won {POINTS['Closed Won']}. Arrows show places climbed since the 30 days before.
          </p>
        </div>
      </div>

      {/* This week */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {weekWon > 0 && <Confetti />}
        {[
          { n: weekFeed.length, label: 'Moves this week', cls: 'bg-brand-sky text-brand-green' },
          { n: weekSql, label: 'New SQLs', cls: 'bg-brand-lime text-brand-green' },
          { n: weekWon, label: weekWon === 1 ? 'Win' : 'Wins', cls: 'bg-brand-green text-white' },
          { n: comebacks.length, label: 'Back from red', cls: 'bg-brand-yellow text-brand-green' },
        ].map(t => (
          <div key={t.label} className={`rounded-2xl p-4 ${t.cls}`}>
            <p className="font-display text-4xl leading-none tabular-nums">{t.n}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] mt-2 opacity-80">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* League table */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <ol>
            {shown.map(r => {
              const climb = r.prevRank - r.rank;
              const isNew = r.pointsPrev30d === 0 && r.points30d > 0;
              const dot = r.band === 'green' ? 'bg-positive-bright' : r.band === 'amber' ? 'bg-warning' : 'bg-negative';
              return (
                <li key={r.slug} className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-gray-100 last:border-0">
                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${r.rank <= 3 && r.points30d > 0 ? MEDAL[r.rank - 1] : 'bg-gray-100 text-gray-500'}`}>
                    {r.rank}
                  </span>
                  <a href={`/partners/${r.slug}`} className="min-w-0 flex-1 group">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
                      <span className="text-sm font-semibold text-gray-900 truncate group-hover:underline">{r.name}</span>
                      {r.comeback && (
                        <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-yellow text-brand-green">Back from red</span>
                      )}
                      {r.streakWeeks >= 2 && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#C2410C]" title={`${r.streakWeeks} weeks in a row with a move`}>
                          <Flame className="w-3 h-3" />{r.streakWeeks}w
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full bg-brand-green/80" style={{ width: `${(r.points30d / maxPts) * 100}%` }} />
                    </span>
                  </a>
                  <span className="shrink-0 w-12 text-right">
                    <span className="block text-sm font-bold text-brand-green tabular-nums">{r.points30d}</span>
                    <span className="block text-[10px] text-gray-400">pts</span>
                  </span>
                  <span className="shrink-0 w-9 text-right text-[11px] font-semibold tabular-nums" aria-label={isNew ? 'New entry' : climb > 0 ? `Up ${climb}` : climb < 0 ? `Down ${-climb}` : 'No change'}>
                    {isNew ? <span className="text-brand-green">NEW</span>
                      : climb > 0 ? <span className="text-positive">▲{climb}</span>
                      : climb < 0 ? <span className="text-negative">▼{-climb}</span>
                      : <span className="text-gray-300">–</span>}
                  </span>
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
                      <a href={`/partners/${f.slug}`} className="text-brand-green font-medium hover:underline">{f.partner}</a>
                      <span className="block text-[11px] text-gray-400">{f.owner} · {when(f.date)}</span>
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
                    <span className="shrink-0 w-10 text-right text-sm font-bold text-brand-green tabular-nums">{t.points30d}</span>
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

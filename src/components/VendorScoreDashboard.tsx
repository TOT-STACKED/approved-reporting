'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  INK, DIM, GRID, AXIS, SURFACE,
  NEGATIVE, NEGATIVE_DARK, WARNING, WARNING_DARK, POSITIVE, POSITIVE_BRIGHT,
} from '@/lib/brand';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// Vendor Score Intelligence — the partner-facing view of their own SOS.
//
// Three questions the monthly report can't answer:
//   1. Which operator segments rate us worst? (where product-market fit is weak)
//   2. Where do we sit against the category average and the category leader?
//   3. Is our score moving?
//
// Deliberate choices worth keeping:
//   • The category leader is ANONYMOUS. Partners get the number to aim at, not
//     a rival's name — that's what keeps operators rating honestly.
//   • Thin slices are shown with their response count and a "provisional" flag
//     rather than hidden. A partner who spots a hidden segment stops trusting
//     the whole dashboard; one who sees "2 responses" knows exactly how much
//     weight to put on it.
//   • The trend line plots the ROLLING all-time score, not the month's own
//     score. At our volume a single month swings wildly; the rolling figure
//     moves slowly and for real reasons, which is the retention story.
//   • One measure per axis. Review counts live in the tooltip and the table
//     view, never plotted as a second series against a second scale.

interface ScoreSlice {
  key: string;
  label: string;
  sos: number | null;
  count: number;
  provisional: boolean;
  vsOverall: number | null;
}

interface CategoryPosition {
  category: string;
  sos: number;
  count: number;
  categoryAverage: number;
  leaderSos: number | null;
  rank: number;
  totalRanked: number;
  gapToAverage: number;
  gapToLeader: number | null;
}

interface ScoreTrendPoint {
  month: string;
  sos: number | null;
  count: number;
  cumulativeSos: number | null;
  cumulativeCount: number;
}

interface Sentiment {
  nps: number | null;
  avg: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  bySource: Record<string, number>;
  recent: Array<{
    id: string;
    created_at: string;
    source: 'techstackreview' | 'toast-support-bot';
    touchpoint: string | null;
    score: number;
    vendor: string | null;
    company: string | null;
    comment: string | null;
  }>;
}

interface ScoreIntelligence {
  overall: { sos: number | null; avg: number | null; count: number };
  sentiment: Sentiment;
  bySegment: ScoreSlice[];
  bySiteBand: ScoreSlice[];
  categories: CategoryPosition[];
  trend: ScoreTrendPoint[];
  movement: { from: number; to: number; delta: number; months: number } | null;
  unsegmented: number;
  minResponses: number;
  marketResponses: number;
}

// Single data hue: series 1, the brand dark purple. Reference marks are
// recessive ink differentiated by dash pattern AND a direct label, so the
// chart never relies on colour to tell a value from a benchmark.
const MARK = INK;
// Colour carries exactly two meanings on this page, and nothing else:
//
//   a score's LEVEL   → the red/amber/green bands below (scoreTone)
//   a CHANGE's direction → red down / green up (movementTone)
//
//   a category bar's SIDE of the average → red below / green above
//                                            (vsAverageTone, category rows only)
//
// The third one is deliberately red/green only — never amber — so it can't be
// mistaken for the band colours on the number beside it. A bar can be green
// (ahead of its category) while the score reads amber (3.4 is still only a
// mid score): those say different things on purpose, and both are spelled out
// in the gap line underneath. Everything else — the reference ticks, "vs your
// avg" on segments — stays in neutral ink with a signed number.

// Traffic light for an absolute score on the 0–5 scale: under 2.5 is a
// problem, 2.5–3.5 is watch-it, 3.5 and up is healthy. Applied to the score
// itself, never as the only signal — the number is always right beside it.
//
// Two ramps because contrast depends on type size. The bright set clears AA
// for large text only (amber 3.2:1, green 3.8:1 on white), which is fine for
// the 48px figure and the 24px bold movement, but fails at 14px. The dark set
// clears 4.5:1 for body copy. `scoreTone(sos, 'text')` picks the safe one.
const SCORE_BRIGHT = { red: NEGATIVE, amber: WARNING, green: POSITIVE_BRIGHT };
const SCORE_TEXT   = { red: NEGATIVE_DARK, amber: WARNING_DARK, green: POSITIVE };

function scoreBand(sos: number): 'red' | 'amber' | 'green' {
  if (sos < 2.5) return 'red';
  if (sos < 3.5) return 'amber';
  return 'green';
}

export function scoreTone(sos: number, size: 'display' | 'text' = 'display'): string {
  const ramp = size === 'text' ? SCORE_TEXT : SCORE_BRIGHT;
  return ramp[scoreBand(sos)];
}

// Which side of the category average the partner sits on. Level (scoreTone)
// answers "is this a good score?"; this answers "is it better than everyone
// else in the category?" — two questions that genuinely disagree sometimes.
// Dead level keeps the neutral brand ink rather than picking a side.
function vsAverageTone(gap: number): string {
  if (gap > 0) return SCORE_BRIGHT.green;
  if (gap < 0) return SCORE_BRIGHT.red;
  return MARK;
}

// Movement is a change, not a level, so it reads off its direction rather than
// the band thresholds: down is red, up is green, flat stays neutral ink. The
// signed() prefix carries the same information without colour.
function movementTone(delta: number): string {
  if (delta < 0) return SCORE_BRIGHT.red;
  if (delta > 0) return SCORE_BRIGHT.green;
  return INK;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`;
}

function bandLabel(sos: number): string {
  if (sos >= 4.5) return 'Exceptional';
  if (sos >= 4.0) return 'Strong';
  if (sos >= 3.0) return 'Solid';
  if (sos >= 2.0) return 'Mixed';
  return 'Caution';
}

function monthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
}

const SOURCE_LABELS: Record<string, string> = {
  'techstackreview': 'Intelligence Review',
  'toast-support-bot': 'Support Chat',
};

function npsTone(score: number | null) {
  if (score == null) return 'text-gray-400';
  if (score >= 30)   return 'text-emerald-600';
  if (score >= 0)    return 'text-amber-600';
  return 'text-rose-600';
}

/** The underlying ratings: NPS, the promoter/detractor split, and the most
 *  recent comments. Kept below the analysis rather than beside it — a partner
 *  reads the segments and position first, then goes looking for the raw
 *  responses behind them. */
function SentimentDetail({ s, count }: { s: Sentiment; count: number }) {
  const pct = (n: number) => (count > 0 ? (n / count) * 100 : 0);
  // Same three hues as the score bands — good / middling / bad means the same
  // thing here, so it shouldn't be a second palette.
  const split: { key: string; label: string; n: number; tone: string }[] = [
    { key: 'promoters',  label: 'Promoters',  n: s.promoters,  tone: SCORE_BRIGHT.green },
    { key: 'passives',   label: 'Passives',   n: s.passives,   tone: SCORE_BRIGHT.amber },
    { key: 'detractors', label: 'Detractors', n: s.detractors, tone: SCORE_BRIGHT.red },
  ];

  return (
    <Card className="mt-4">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">The ratings behind it</h3>
          <p className="text-xs text-gray-500">
            Every rating counted above, across each Stacked touchpoint
          </p>
        </div>
        {Object.keys(s.bySource).length > 0 && (
          <p className="text-xs text-gray-500">
            {Object.entries(s.bySource)
              .map(([src, n]) => `${SOURCE_LABELS[src] ?? src} · ${n}`)
              .join('  ·  ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className={`text-2xl font-bold ${npsTone(s.nps)}`}>{s.nps ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">NPS</p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-2xl font-bold text-brand-green">{s.avg ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Avg / 10</p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-2xl font-bold text-brand-green">{count}</p>
          <p className="text-xs text-gray-500 mt-1">Responses</p>
        </div>
      </div>

      <div className="mb-5">
        {/* 2px surface gaps between segments so the split reads as three
            distinct bands rather than one blended bar. */}
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-gray-100">
          {split.filter(x => x.n > 0).map(x => (
            <div key={x.key} style={{ width: `${pct(x.n)}%`, background: x.tone }} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs mt-2">
          {split.map(x => (
            <div key={x.key}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: x.tone }} />
                <span className="text-gray-600">{x.label}</span>
              </div>
              <div className="text-gray-800 font-medium mt-0.5 tabular-nums">
                {x.n} <span className="text-gray-400 font-normal">({Math.round(pct(x.n))}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {s.recent.length > 0 && (
        <div className="overflow-x-auto -mx-5 sm:-mx-6">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Date</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Source</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Product</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Operator</th>
                <th className="text-center py-2 px-2 text-gray-500 font-medium">Score</th>
                <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map(r => {
                const tone = r.score >= 9 ? 'bg-emerald-100 text-emerald-700'
                           : r.score >= 7 ? 'bg-amber-100 text-amber-700'
                           : 'bg-rose-100 text-rose-700';
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-5 sm:px-6 text-gray-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                      {SOURCE_LABELS[r.source] ?? r.source}
                    </td>
                    <td className="py-2 px-2 text-gray-800 font-medium whitespace-nowrap">{r.vendor ?? '—'}</td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{r.company ?? '—'}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded font-semibold ${tone}`}>{r.score}</span>
                    </td>
                    <td className="py-2 px-5 sm:px-6 text-gray-600 max-w-xs truncate">{r.comment ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

/** A 0–5 track with the partner's score filled in. Used on its own for a
 *  segment, or with benchmark ticks for a category. */
function ScoreTrack({
  sos,
  refs = [],
  tone = MARK,
}: {
  sos: number;
  refs?: { at: number; label: string; dash: string; ink: string }[];
  tone?: string;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / 5) * 100))}%`;
  // Collision guard: two ticks closer than 10% of the track share one label
  // slot, so we drop the lower-priority label rather than overprint. The
  // values are always spelled out in the row beneath, so nothing is lost.
  const visible = refs.filter((r, i) =>
    refs.every((o, j) => j >= i || Math.abs(o.at - r.at) / 5 > 0.1)
  );
  return (
    <div className="relative h-7">
      <div className="absolute inset-x-0 top-2.5 h-2.5 rounded-full bg-gray-100" />
      <div
        className="absolute top-2.5 left-0 h-2.5 rounded-full"
        style={{ width: pct(sos), background: tone }}
      />
      {refs.map(r => (
        <div
          key={r.label}
          className="absolute top-1 h-6 border-l-2"
          style={{ left: pct(r.at), borderColor: r.ink, borderLeftStyle: r.dash as 'dashed' | 'solid' }}
          title={`${r.label} ${fmt(r.at)}`}
        />
      ))}
      {visible.map(r => (
        <span
          key={r.label}
          className="absolute -top-0.5 text-[9px] uppercase tracking-wide text-gray-500 -translate-x-1/2 whitespace-nowrap"
          style={{ left: pct(r.at) }}
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}

function SliceRows({ slices, minResponses }: { slices: ScoreSlice[]; minResponses: number }) {
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Segment</th>
          <th>Score</th>
          <th>Vs your average</th>
          <th>Responses</th>
        </tr>
      </thead>
      <tbody>
        {slices.map(s => (
          <tr key={s.key} className="align-middle">
            <td className="py-2 pr-3 w-[38%] sm:w-[30%]">
              <span className="text-gray-900">{s.label}</span>
              {s.provisional && (
                <span
                  className="ml-1.5 text-[10px] text-gray-400"
                  title={`Under ${minResponses} responses — indicative only`}
                >
                  provisional
                </span>
              )}
              {/* On mobile the reviews column is dropped, so the count rides
                  under the label instead of being clipped off the card. */}
              <span className="block sm:hidden text-[11px] text-gray-400 tabular-nums">
                {s.count} {s.count === 1 ? 'review' : 'reviews'}
              </span>
            </td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-3">
                <span
                  className="font-bold tabular-nums w-8"
                  style={s.sos === null ? undefined : { color: scoreTone(s.sos, 'text') }}
                >
                  {s.sos === null ? '—' : fmt(s.sos)}
                </span>
                {/* One hue for every bar: length carries the magnitude, the
                    numeral beside it carries the band. */}
                <div className="flex-1 min-w-[80px]">
                  {s.sos !== null && <ScoreTrack sos={s.sos} />}
                </div>
              </div>
            </td>
            <td className="py-2 pr-3 text-right whitespace-nowrap">
              {s.vsOverall === null ? (
                <span className="text-gray-300">—</span>
              ) : (
                <span className="text-xs tabular-nums text-gray-500">
                  {signed(s.vsOverall)}
                  <span className="text-gray-400 hidden sm:inline"> vs your avg</span>
                </span>
              )}
            </td>
            <td className="py-2 text-right text-xs text-gray-400 tabular-nums whitespace-nowrap hidden sm:table-cell">
              {s.count} {s.count === 1 ? 'review' : 'reviews'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScoreTrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-brand-green text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      <div className="font-semibold">{monthShort(p.month)} {p.month.slice(0, 4)}</div>
      <div className="text-white/80">
        Rolling score {p.cumulativeSos === null ? '—' : fmt(p.cumulativeSos)}
        <span className="text-white/50"> · {p.cumulativeCount} reviews to date</span>
      </div>
      <div className="text-white/60">
        {p.count === 0 ? 'No new reviews this month' : `${p.count} new this month (${fmt(p.sos!)})`}
      </div>
    </div>
  );
}

function TrendChart({ trend }: { trend: ScoreTrendPoint[] }) {
  // Padded, explicitly-labelled domain. A fixed 0–5 axis would flatten the
  // 0.2–0.5 movements that are the entire point of this view, so the axis is
  // windowed to the data and both bounds are printed on it.
  const values = trend.map(p => p.cumulativeSos).filter((v): v is number => v !== null);
  const mid = (Math.min(...values) + Math.max(...values)) / 2;
  const span = Math.max(1, Math.max(...values) - Math.min(...values) + 0.5);
  const yMin = Math.max(0, Number((mid - span / 2).toFixed(1)));
  const yMax = Math.min(5, Number((mid + span / 2).toFixed(1)));

  return (
    <div>
      <div style={{ width: '100%', height: 190 }}>
        <ResponsiveContainer>
          <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="month"
              tickFormatter={monthShort}
              tick={{ fontSize: 10, fill: AXIS }}
              interval="preserveStartEnd"
              minTickGap={16}
              axisLine={{ stroke: GRID }}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              ticks={[yMin, yMax]}
              tickFormatter={(v: number) => fmt(v)}
              tick={{ fontSize: 10, fill: AXIS }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<TrendTooltip />} />
            <Line
              type="monotone"
              dataKey="cumulativeSos"
              stroke={MARK}
              strokeWidth={2}
              dot={{ r: 3.5, fill: MARK, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: MARK, stroke: SURFACE, strokeWidth: 2 }}
              connectNulls={false}
              // No reveal animation: this view reloads on every visit and a
              // score line that draws itself in reads as a chart still loading.
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-2">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
          View as table
        </summary>
        <table className="w-full text-xs mt-2">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100">
              <th className="text-left py-1.5 font-medium">Month</th>
              <th className="text-right py-1.5 font-medium">New reviews</th>
              <th className="text-right py-1.5 font-medium">Month score</th>
              <th className="text-right py-1.5 font-medium">Rolling score</th>
            </tr>
          </thead>
          <tbody>
            {trend.map(p => (
              <tr key={p.month} className="border-b border-gray-50">
                <td className="py-1.5 text-gray-700">{monthShort(p.month)} {p.month.slice(0, 4)}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-500">{p.count}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-500">{p.sos === null ? '—' : fmt(p.sos)}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-900">{p.cumulativeSos === null ? '—' : fmt(p.cumulativeSos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// The score is split into two exports so the page can lead with the number and
// then go straight into the pipeline boxes, instead of making a partner scroll
// past eight lead sections to find what they pay for:
//
//   usePartnerScore  — one fetch, owned by the page
//   ScoreHeadline    — the figure alone, sits under the partner name
//   ScoreDetail      — the analysis, sits further down
//
// The page owns the fetch deliberately. Two self-fetching components would mean
// two reads of the score endpoint per page load, which is exactly what the last
// round of work removed.
export function usePartnerScore(endpoint: string) {
  const [score, setScore] = useState<ScoreIntelligence | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    fetch(endpoint)
      .then(r => r.json())
      .then(d => {
        if (!live) return;
        if (d?.score) { setScore(d.score); setState('ready'); }
        else setState('error');
      })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [endpoint]);

  return { score, state };
}

/** The headline figure, for directly under the partner name. Renders nothing
 *  while loading, on error, or before a partner's first rating — an empty or
 *  half-loaded number in the page header is worse than no number, and the
 *  detail section below explains the absence properly. */
export function ScoreHeadline({ score }: { score: ScoreIntelligence | null }) {
  if (!score) return null;
  const { overall, movement, bySegment } = score;
  // Narrow to a real number here so the JSX below doesn't have to keep asserting.
  const sos = overall.sos;
  if (sos === null || overall.count === 0) return null;

  const best = bySegment.length > 1 ? bySegment[0] : null;
  const worst = bySegment.length > 1 ? bySegment[bySegment.length - 1] : null;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
            Your operator score
          </div>
          <div className="flex items-end gap-2">
            <span
              className="font-display text-5xl leading-none tabular-nums"
              style={{ color: scoreTone(sos) }}
            >
              {fmt(sos)}
            </span>
            <span className="text-sm text-gray-400 mb-1">/ 5</span>
          </div>
          <div className="text-xs text-gray-500 mt-1.5">
            {bandLabel(sos)} · {overall.count} operator {overall.count === 1 ? 'review' : 'reviews'}
          </div>
        </div>

        <div className="border-l border-gray-100 pl-6">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Movement</div>
          {movement ? (
            <>
              <div
                className="text-2xl font-bold tabular-nums leading-none"
                style={{ color: movementTone(movement.delta) }}
              >
                {signed(movement.delta)}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">
                {fmt(movement.from)} → {fmt(movement.to)} across {movement.months} months
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-300 leading-none">—</div>
              <div className="text-xs text-gray-500 mt-1.5 max-w-[15rem]">
                Needs two months of ratings.
              </div>
            </>
          )}
        </div>

        {/* Hidden on mobile: it's the least urgent of the three and stacking it
            pushed the pipeline boxes off the fold. It's repeated in the segment
            table below either way. */}
        {best && worst && best.key !== worst.key && (
          <div className="border-l border-gray-100 pl-6 hidden sm:block">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Widest gap</div>
            <div className="text-sm text-gray-900 leading-snug">
              <span className="font-semibold" style={{ color: scoreTone(best.sos!, 'text') }}>
                {fmt(best.sos!)}
              </span>{' '}
              in <span className="font-medium">{best.label}</span>
              <br />
              <span className="font-semibold" style={{ color: scoreTone(worst.sos!, 'text') }}>
                {fmt(worst.sos!)}
              </span>{' '}
              in <span className="font-medium">{worst.label}</span>
            </div>
          </div>
        )}

        <div className="sm:border-l sm:border-gray-100 sm:pl-6">
          <a href="#score-intelligence" className="text-xs text-brand-green underline hover:no-underline">
            See the breakdown ↓
          </a>
        </div>
      </div>

      {/* Why the number is out of 5 and not an NPS. Operators are asked the
          standard 0–10 "would you recommend?" question, so an NPS exists — but
          −100 to +100 is a scale almost nobody reads correctly at a glance, so
          we publish the same responses as a plain 0–5 score instead. */}
      <p className="text-xs text-gray-500 leading-relaxed mt-4 pt-3 border-t border-gray-100 max-w-3xl">
        <span className="font-medium text-gray-700">Why 0–5 and not NPS?</span>{' '}
        Operators answer the standard 0–10 &ldquo;how likely are you to recommend?&rdquo;
        question — the same question a Net Promoter Score is built from. NPS then compresses
        those answers into a −100 to +100 figure that&apos;s genuinely hard to read: it hides
        how people actually scored you, and a −100 to +100 number means little to an operator.
        So we publish the same responses as the Stacked Operator Score (SOS) — the average
        0–10 rating, halved onto a 0–5 scale everyone already understands. Nothing is
        weighted or filtered on the way: {fmt(sos)} out of 5 is simply what operators gave you.
      </p>
    </Card>
  );
}

/** The analysis: segments, category position, trend, and the ratings behind it.
 *  No headline card — ScoreHeadline already carried the number up the page. */
export function ScoreDetail({
  score,
  state,
  partnerName,
}: {
  score: ScoreIntelligence | null;
  state: 'loading' | 'ready' | 'error';
  partnerName: string;
}) {
  const monthsWithData = useMemo(
    () => (score?.trend ?? []).filter(p => p.count > 0).length,
    [score]
  );

  if (state === 'loading') {
    return (
      <Card className="mb-6 sm:mb-8">
        <p className="text-sm text-gray-500">Loading your score intelligence…</p>
      </Card>
    );
  }

  if (state === 'error' || !score) {
    return (
      <Card className="mb-6 sm:mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">Score Intelligence</h2>
        <p className="text-sm text-gray-500">
          We couldn&apos;t load your score right now. It&apos;ll be back on the next refresh —
          nothing is lost.
        </p>
      </Card>
    );
  }

  const { overall, sentiment, bySegment, bySiteBand, categories, trend, movement, unsegmented, minResponses } = score;
  void movement;

  // No ratings at all — say so plainly and say what causes ratings to arrive,
  // rather than showing four empty charts.
  if (overall.sos === null || overall.count === 0) {
    return (
      <Card className="mb-6 sm:mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">Score Intelligence</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          No operator has rated {partnerName}{' '}
          yet. Ratings arrive when an operator picks you
          in an Intelligence Review and scores you 0–10 on whether they&apos;d recommend you — so this
          fills in as review volume builds. Everything below unlocks on your first rating.
        </p>
      </Card>
    );
  }

  return (
    <section id="score-intelligence" className="mb-6 sm:mb-8 scroll-mt-6">
      <div className="mb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-brand-green">Score Intelligence</h2>
          <span className="text-xs text-gray-400">Stacked Operator Score · 0–5</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
          Your own operator score, cut by who&apos;s rating you, where you sit in your
          categories, and which way it&apos;s moving. Built from the 0–10 &ldquo;would you
          recommend?&rdquo; rating operators give each tool in their Intelligence Review.
          Competitors are never named.
        </p>
      </div>

      {/* 1. Segment breakdown */}
      <Card className="mb-4">
        <h3 className="font-semibold text-gray-900 mb-1">Who rates you, and how</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          Segment comes from the venue type and site count the operator gives at the start of
          their Intelligence Review — before they rate anything — so it&apos;s declared, not inferred.
          The segment scoring lowest is where your onboarding or support model fits worst.
        </p>

        {bySegment.length === 0 ? (
          <p className="text-sm text-gray-500">
            None of your ratings can be traced back to a segmented submission yet.
          </p>
        ) : (
          <SliceRows slices={bySegment} minResponses={minResponses} />
        )}

        {bySiteBand.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">By estate size</div>
            <SliceRows slices={bySiteBand} minResponses={minResponses} />
          </div>
        )}

        {unsegmented > 0 && (
          <p className="text-[11px] text-gray-400 mt-3">
            {unsegmented} of your {overall.count} ratings arrived without a linked submission
            (older rows and support-channel ratings), so they count towards your overall score
            but not the segments above.
          </p>
        )}
      </Card>

      {/* 2. Category position */}
      <Card className="mb-4">
        <h3 className="font-semibold text-gray-900 mb-1">Where you sit in your categories</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          Category average is every rating given to every tool in that category. The leader is
          the highest-scoring product with {minResponses}+ reviews — we show you the number to
          beat, never the name.
        </p>

        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">No category benchmark available yet.</p>
        ) : (
          <div className="space-y-5">
            {categories.map(c => (
              <div key={c.category}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {c.category}
                    {/* Same caveat the segment rows carry. Without it a
                        category score built on one response reads with the
                        same weight as one built on twenty. */}
                    {c.count < minResponses && (
                      <span
                        className="ml-1.5 text-[10px] font-normal text-gray-400"
                        title={`Under ${minResponses} responses — indicative only`}
                      >
                        provisional
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                    {c.rank > 0 ? `#${c.rank} of ${c.totalRanked} ranked` : 'not yet ranked'}
                    <span className="text-gray-300"> · {c.count} {c.count === 1 ? 'review' : 'reviews'}</span>
                  </span>
                </div>

                <ScoreTrack
                  sos={c.sos}
                  tone={vsAverageTone(c.gapToAverage)}
                  refs={[
                    // No leader tick when the partner is the leader — it would
                    // land on their own bar and read as a rival on top of them.
                    ...(c.leaderSos !== null && c.rank !== 1
                      ? [{ at: c.leaderSos, label: 'Leader', dash: 'solid', ink: INK }]
                      : []),
                    { at: c.categoryAverage, label: 'Avg', dash: 'dashed', ink: DIM },
                  ]}
                />

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
                  <span className="tabular-nums">
                    <span className="font-bold" style={{ color: scoreTone(c.sos, 'text') }}>{fmt(c.sos)}</span>
                    <span className="text-gray-400"> you</span>
                  </span>
                  <span className="tabular-nums text-gray-500">
                    {fmt(c.categoryAverage)} <span className="text-gray-400">category avg</span>
                    <span className="text-gray-500"> ({signed(c.gapToAverage)})</span>
                  </span>
                  {c.rank === 1 ? (
                    <span className="font-medium" style={{ color: MARK }}>
                      you lead this category
                    </span>
                  ) : c.leaderSos !== null ? (
                    <span className="tabular-nums text-gray-500">
                      {fmt(c.leaderSos)} <span className="text-gray-400">leader</span>
                      {c.gapToLeader !== null && c.gapToLeader < 0 && (
                        <span className="text-gray-500"> ({signed(c.gapToLeader)})</span>
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 3. Trend */}
      <Card>
        <h3 className="font-semibold text-gray-900 mb-1">Is your score moving?</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-3xl">
          This plots your <span className="font-medium">rolling</span>{' '}
          score — every rating to date, not just that month&apos;s. At current review volume a single month swings hard,
          so the rolling line is the one to judge CS investment by.
        </p>

        {monthsWithData < 2 ? (
          <div className="rounded-lg bg-brand-cream-soft border border-gray-200 px-4 py-4">
            <p className="text-sm text-gray-700">
              {monthsWithData === 0
                ? 'No ratings in the last 12 months.'
                : `Only one month of ratings so far (${overall.count} ${overall.count === 1 ? 'review' : 'reviews'}), so there's no trend to draw yet.`}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              A trend line needs two months of data and reads reliably from around 60–90 days.
              We&apos;d rather show you nothing than a line drawn through one point.
            </p>
          </div>
        ) : (
          <TrendChart trend={trend} />
        )}
      </Card>

      <SentimentDetail s={sentiment} count={overall.count} />
    </section>
  );
}

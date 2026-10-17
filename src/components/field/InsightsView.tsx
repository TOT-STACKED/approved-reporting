'use client';

import { useMemo, useState } from 'react';
import { Chip } from './FieldChrome';
import { FIELD_CATEGORIES, FIELD_VENUE_TYPES, labelFor, stackLabel, ukDay, venueKey, type FieldStack } from '@/lib/field-shared';

// Insights from what the field team records. Flat bars in brand purple with
// the number beside each (brand rule: colour never carries meaning alone;
// orange is for calls to action only). Repeat reviews of one venue count once.

interface Slim {
  id: string; visited_at: string; agent_id: string; source: 'field' | 'intelligence'; submission_id: string | null;
  venue_name: string; postcode: string | null; lat: number | null; lng: number | null; venue_type: string | null;
  ownership: string | null; stack: FieldStack; demo_interest: string | null; photos: number;
}

const RANGES = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: Infinity },
] as const;

function Bars({ rows, total, max = 8 }: { rows: [string, number][]; total: number; max?: number }) {
  if (!rows.length) return <p className="py-2 text-[14px] text-muted">Nothing recorded yet.</p>;
  const top = rows[0][1];
  return (
    <ul className="flex flex-col gap-2">
      {rows.slice(0, max).map(([label, n]) => (
        <li key={label}>
          <div className="mb-1 flex justify-between gap-3 text-[14px]">
            <span className="truncate">{label}</span>
            <span className="shrink-0 font-mono">{n}{total ? <span className="text-muted"> · {Math.round((n / total) * 100)}%</span> : null}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(n / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl bg-surface p-4">
      <h2 className="text-[16px] font-bold">{title}</h2>
      {note && <p className="mb-3 text-[13px] text-muted">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function count<T>(items: T[], key: (t: T) => string | string[] | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    for (const one of Array.isArray(k) ? k : k ? [k] : []) m.set(one, (m.get(one) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const toolsIn = (stack: FieldStack, cat: string) => {
  const e = stack[cat];
  if (!e || e.none) return [];
  return [...(e.tools || []), ...(e.other?.trim() ? [e.other.trim()] : [])];
};

export default function InsightsView({ agents, visits }: { agents: { id: string; name: string }[]; visits: Slim[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30d');
  const [withHistory, setWithHistory] = useState(false);
  const [now] = useState(() => Date.now());

  // Visits in range, one per venue (the latest), app visits only unless history is on.
  const venues = useMemo(() => {
    const r = RANGES.find(x => x.id === range)!;
    const from = r.days === Infinity ? '' : ukDay(now - r.days * 86400000);
    const seen = new Set<string>();
    return visits.filter(v => {
      if (!withHistory && v.source !== 'field') return false;
      if (from && ukDay(v.visited_at) < from) return false;
      const k = venueKey(v);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [visits, range, withHistory, now]);

  const fieldInRange = useMemo(() => {
    const r = RANGES.find(x => x.id === range)!;
    const from = r.days === Infinity ? '' : ukDay(now - r.days * 86400000);
    return visits.filter(v => v.source === 'field' && (!from || ukDay(v.visited_at) >= from));
  }, [visits, range, now]);

  const withTech = (cat: string) => venues.filter(v => v.stack[cat] && (v.stack[cat].none || toolsIn(v.stack, cat).length));

  const kpis = [
    { n: fieldInRange.length, l: 'visits' },
    { n: venues.length, l: withHistory ? 'venues incl. history' : 'venues' },
    { n: fieldInRange.filter(v => v.submission_id).length, l: 'reviews done' },
    { n: fieldInRange.filter(v => v.demo_interest === 'yes').length, l: 'want a demo' },
  ];

  // Gaps: of venues where the category was checked, how many had nothing.
  const gaps = FIELD_CATEGORIES.map(c => {
    const checked = withTech(c.id);
    const none = checked.filter(v => v.stack[c.id].none).length;
    return { label: c.label, checked: checked.length, none };
  }).filter(g => g.checked >= 3).sort((a, b) => b.none / b.checked - a.none / a.checked);

  // Weekly activity per agent, last 8 weeks, app visits only.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - i * 7 * 86400000;
    return { from: ukDay(end - 6 * 86400000), to: ukDay(end) };
  }).reverse();
  const activity = agents.map(a => ({
    name: a.name,
    perWeek: weeks.map(w => visits.filter(v => v.source === 'field' && v.agent_id === a.id && ukDay(v.visited_at) >= w.from && ukDay(v.visited_at) <= w.to).length),
  })).filter(a => a.perWeek.some(Boolean));
  const peak = Math.max(1, ...activity.flatMap(a => a.perWeek));

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-3 md:max-w-4xl">
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {RANGES.map(r => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}
      </div>
      <div className="mb-4 flex gap-2">
        <Chip on={!withHistory} onClick={() => setWithHistory(false)}>Field visits</Chip>
        <Chip on={withHistory} onClick={() => setWithHistory(true)}>+ Intelligence history</Chip>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpis.map(k => (
          <div key={k.l} className="rounded-2xl bg-surface p-3">
            <p className="font-mono text-[28px] leading-none">{k.n}</p>
            <p className="mt-1 text-[12px] text-muted">{k.l}</p>
          </div>
        ))}
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-4">
        {['pos', 'payments', 'ordering', 'reservations'].map(cat => {
          const list = withTech(cat).filter(v => !v.stack[cat].none);
          return (
            <Card key={cat} title={`${stackLabel(cat)} seen`} note={`Across ${list.length} venue${list.length === 1 ? '' : 's'} where it was spotted`}>
              <Bars rows={count(list, v => toolsIn(v.stack, cat))} total={list.length} />
            </Card>
          );
        })}

        <Card title="Gaps" note="Of venues where the agent checked, how many had nothing. Where to sell.">
          {gaps.length ? (
            <ul className="flex flex-col gap-2">
              {gaps.slice(0, 8).map(g => (
                <li key={g.label}>
                  <div className="mb-1 flex justify-between text-[14px]">
                    <span>No {g.label.toLowerCase()}</span>
                    <span className="font-mono">{g.none} of {g.checked} <span className="text-muted">· {Math.round((g.none / g.checked) * 100)}%</span></span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${(g.none / g.checked) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-[14px] text-muted">Needs a few more visits with “None here” ticked.</p>}
        </Card>

        <Card title="Where" note="Postcode areas covered">
          <Bars rows={count(venues, v => v.postcode ? v.postcode.split(' ')[0] : null)} total={venues.filter(v => v.postcode).length} />
        </Card>

        <Card title="Venue mix">
          <Bars rows={count(venues, v => (v.venue_type ? labelFor(FIELD_VENUE_TYPES, v.venue_type) : null))} total={venues.filter(v => v.venue_type).length} />
        </Card>

        <Card title="Most-seen tools overall" note="Any category">
          <Bars rows={count(venues, v => Object.keys(v.stack).flatMap(cat => toolsIn(v.stack, cat)))} total={venues.length} max={10} />
        </Card>
      </div>

      <Card title="Team activity" note="App visits per week, last 8 weeks">
        {activity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {activity.map(a => (
                  <tr key={a.name}>
                    <td className="py-1.5 pr-3 font-bold whitespace-nowrap">{a.name}</td>
                    {a.perWeek.map((n, i) => (
                      <td key={i} className="px-0.5 py-1.5">
                        <div className="flex h-8 w-7 items-end overflow-hidden rounded bg-surface-2" title={`${weeks[i].from}: ${n}`}>
                          <div className="w-full bg-ink" style={{ height: `${(n / peak) * 100}%` }} />
                        </div>
                        <div className="mt-0.5 text-center font-mono text-[11px]">{n}</div>
                      </td>
                    ))}
                    <td className="pl-2 text-right font-mono">{a.perWeek.reduce((x, y) => x + y, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-[14px] text-muted">No app visits in the last 8 weeks yet.</p>}
        <p className="mt-2 text-[12px] text-muted">Oldest week on the left. Total on the right.</p>
      </Card>
    </main>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import FieldMap, { type MapPin, type MapTrail } from './FieldMap';
import { Chip } from './FieldChrome';
import VisitList from './VisitList';
import { fmtWhen, stackCount, ukDay, type FieldAgent, type FieldVisit } from '@/lib/field-shared';

// The manager's view of where everyone has been. Pins are coloured per agent:
// filled for visits logged in the app, rings for history brought in from
// Intelligence Reviews. "Routes" joins each agent's visits for a day in the
// order they happened.

// Brand series colours, darkest first, so the first agents get the strongest.
const AGENT_COLORS = ['#38278F', '#FF5014', '#167034', '#E5484D', '#4E71F2', '#8B5A0F', '#FF90C0', '#0E7C86'];

const RANGES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: 'all', label: 'All time', days: Infinity },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

export default function ManageView({ agents, visits }: { agents: FieldAgent[]; visits: FieldVisit[] }) {
  const [range, setRange] = useState<RangeId>('7d');
  const [who, setWho] = useState<string>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [routes, setRoutes] = useState(true);
  const [selected, setSelected] = useState<FieldVisit | null>(null);
  // "Now" as of page load, so filtering stays pure across re-renders.
  const [now] = useState(() => Date.now());

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a, i) => m.set(a.id, AGENT_COLORS[i % AGENT_COLORS.length]));
    return (id: string) => m.get(id) || '#827D74';
  }, [agents]);

  const shown = useMemo(() => {
    const today = ukDay(now);
    const r = RANGES.find(x => x.id === range)!;
    const fromDay = r.days === Infinity ? '' : r.days === 0 ? today : ukDay(now - r.days * 86400000);
    return visits.filter(v =>
      (who === 'all' || v.agent_id === who) &&
      (showHistory || v.source === 'field') &&
      (!fromDay || ukDay(v.visited_at) >= fromDay),
    );
  }, [visits, range, who, showHistory, now]);

  const pins: MapPin[] = shown.map(v => ({
    id: v.id,
    lat: v.lat,
    lng: v.lng,
    label: `${v.venue_name} · ${v.agent_name || ''} · ${fmtWhen(v.visited_at)}`,
    tone: selected?.id === v.id ? 'selected' : 'visited',
    color: selected?.id === v.id ? undefined : colorFor(v.agent_id),
    hollow: v.source === 'intelligence' && selected?.id !== v.id,
  }));

  // One trail per agent per UK day, field visits only, oldest first.
  const trails: MapTrail[] = useMemo(() => {
    if (!routes) return [];
    const groups = new Map<string, FieldVisit[]>();
    for (const v of shown) {
      if (v.source !== 'field') continue;
      const k = `${v.agent_id}:${ukDay(v.visited_at)}`;
      groups.set(k, [...(groups.get(k) || []), v]);
    }
    return [...groups.entries()].map(([k, vs]) => ({
      id: k,
      color: colorFor(vs[0].agent_id),
      points: [...vs].sort((a, b) => a.visited_at.localeCompare(b.visited_at)).map(v => ({ lat: v.lat, lng: v.lng })),
    }));
  }, [shown, routes, colorFor]);

  const perAgent = agents
    .map(a => {
      const mine = shown.filter(v => v.agent_id === a.id);
      return {
        agent: a,
        count: mine.length,
        today: mine.filter(v => ukDay(v.visited_at) === ukDay(now)).length,
        leads: mine.filter(v => v.demo_interest === 'yes').length,
        last: mine[0]?.visited_at || null,
      };
    })
    .filter(r => r.agent.active || r.count);

  const exportQs = new URLSearchParams();
  if (who !== 'all') exportQs.set('agent', who);
  const rr = RANGES.find(x => x.id === range)!;
  if (rr.days !== Infinity) exportQs.set('from', `${ukDay(now - rr.days * 86400000)}T00:00:00Z`);

  const totalTech = shown.filter(v => stackCount(v.stack) > 0).length;
  const leads = shown.filter(v => v.demo_interest === 'yes').length;

  return (
    <main className="mx-auto w-full max-w-6xl lg:grid lg:grid-cols-[1fr_380px] lg:gap-4 lg:px-4 lg:pt-4">
      <div className="lg:sticky lg:top-18 lg:self-start">
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-2 lg:px-0 [&::-webkit-scrollbar]:hidden">
          {RANGES.map(r => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 lg:px-0 [&::-webkit-scrollbar]:hidden">
          <Chip on={who === 'all'} onClick={() => setWho('all')}>Everyone</Chip>
          {agents.filter(a => a.active).map(a => (
            <Chip key={a.id} on={who === a.id} onClick={() => setWho(who === a.id ? 'all' : a.id)}>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: colorFor(a.id) }} />
              {a.name || a.email.split('@')[0]}
            </Chip>
          ))}
        </div>

        <div className="relative lg:overflow-hidden lg:rounded-2xl">
          <FieldMap
            className="h-[52vh] min-h-72 w-full lg:h-[calc(100dvh-220px)]"
            pins={pins}
            trails={trails}
            fit
            zoom={12}
            onPinClick={id => setSelected(shown.find(v => v.id === id) || null)}
          />
          <div className="absolute top-3 left-3 z-[500] flex flex-col gap-2">
            <button type="button" onClick={() => setRoutes(!routes)}
              className={`h-10 rounded-full px-4 text-[13px] font-bold shadow ${routes ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
              Routes {routes ? 'on' : 'off'}
            </button>
            <button type="button" onClick={() => setShowHistory(!showHistory)}
              className={`h-10 rounded-full px-4 text-[13px] font-bold shadow ${showHistory ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
              Intelligence {showHistory ? 'on' : 'off'}
            </button>
          </div>
          {selected && (
            <div className="absolute inset-x-3 bottom-3 z-[500] rounded-2xl bg-surface p-4 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: colorFor(selected.agent_id) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold">{selected.venue_name}</p>
                  <p className="text-[13px] text-muted">
                    {selected.agent_name} · {fmtWhen(selected.visited_at)}
                    {selected.source === 'intelligence' ? ' · Intelligence' : ''}
                    {` · ${stackCount(selected.stack)} tech`}
                  </p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="-mt-1 -mr-1 grid h-10 w-10 place-items-center text-xl text-muted">×</button>
              </div>
              <Link href={`/field/visits/${selected.id}`} className="mt-3 flex h-12 items-center justify-center rounded-xl bg-ink text-[15px] font-bold text-white">
                Open visit
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 lg:px-0 lg:pt-0">
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { n: shown.length, l: 'visits' },
            { n: totalTech, l: 'with tech' },
            { n: leads, l: 'leads' },
          ].map(s => (
            <div key={s.l} className="rounded-2xl bg-surface p-3">
              <p className="font-mono text-[26px] leading-none">{s.n}</p>
              <p className="mt-1 text-[12px] text-muted">{s.l}</p>
            </div>
          ))}
        </div>

        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">By agent</h2>
        <ul className="mb-5 divide-y divide-border overflow-hidden rounded-2xl bg-surface">
          {perAgent.map(r => (
            <li key={r.agent.id}>
              <button type="button" onClick={() => setWho(who === r.agent.id ? 'all' : r.agent.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorFor(r.agent.id) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{r.agent.name || r.agent.email}</span>
                  <span className="block text-[12px] text-muted">{r.last ? `Last ${fmtWhen(r.last)}` : 'No visits in range'}</span>
                </span>
                <span className="text-right font-mono text-[13px]">
                  <span className="block text-[18px]">{r.count}</span>
                  <span className="text-muted">{r.today} today · {r.leads} leads</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Visits</h2>
          <a href={`/api/field/export?${exportQs}`} className="flex h-10 items-center rounded-full px-3 text-[13px] font-bold text-ink underline underline-offset-4">Export CSV</a>
        </div>
        {shown.length ? <VisitList visits={shown.slice(0, 100)} showAgent /> : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">No visits in this range.</p>
        )}
        {shown.length > 100 && <p className="mt-2 text-center text-[13px] text-muted">Showing the latest 100. Export for the rest.</p>}
      </div>
    </main>
  );
}

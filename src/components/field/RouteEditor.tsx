'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FieldMap, { type MapPin } from './FieldMap';
import { Chip } from './FieldChrome';
import { distanceM, fmtWhen, ukDay, type FieldAgent, type FieldVisit } from '@/lib/field-shared';
import type { FieldTarget } from '@/lib/field-targets-shared';
import {
  bestOrder,
  defaultRouteName,
  directionsUrl,
  mondayOf,
  progress,
  routeIsCurrent,
  type FieldRoute,
  type RouteStop,
} from '@/lib/field-routes-shared';

// Plan, run and look back on a route. One screen for all three:
//   plan  — add stops (search, tap a known venue, or tap the map), order them
//   run   — next stop up top, "Start visit here", directions in Google Maps
//   look back — planned line vs where the agent actually went that day/week

interface SearchResult { name: string; address: string; postcode: string; lat: number; lng: number; ref: string | null; known: boolean; source?: 'known' | 'target' | 'map' | 'postcode' | 'area' }

const SOURCE_TAG: Record<string, string> = { known: 'Known', target: 'Target', postcode: 'Postcode', area: 'Area' };

const INPUT = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] text-ink placeholder:text-dim focus:border-ink focus:outline-none';
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted';

export default function RouteEditor({ route, me, agents, known, actual, targets = [] }: {
  route?: FieldRoute;
  me: FieldAgent;
  /** Managers: who a route can be planned for. */
  agents: FieldAgent[];
  /** Venues the team already knows, to tap onto the route. */
  known: { id: string; venue_name: string; address: string | null; postcode: string | null; lat: number; lng: number; osm_ref: string | null }[];
  /** The agent's visits during the route's day/week: where they actually went. */
  actual: FieldVisit[];
  /** Brand targets the team hasn't visited yet. */
  targets?: FieldTarget[];
}) {
  const router = useRouter();
  // Today as of page load, so rendering stays pure.
  const [today] = useState(() => ukDay(Date.now()));
  const [period, setPeriod] = useState<'day' | 'week'>(route?.period || 'day');
  const [startsOn, setStartsOn] = useState(route?.starts_on || today);
  const [name, setName] = useState(route?.name || '');
  const [agentId, setAgentId] = useState(route?.agent_id || me.id);
  const [stops, setStops] = useState<RouteStop[]>(route?.stops || []);
  const [notes, setNotes] = useState(route?.notes || '');
  const [dirty, setDirty] = useState(!route);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // A stop nobody's lookup could find: the next map tap places it.
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [notesMsg, setNotesMsg] = useState('');
  const [resolving, setResolving] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showKnown, setShowKnown] = useState(true);
  const [showTargets, setShowTargets] = useState(targets.length > 0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { maximumAge: 60000, timeout: 10000 });
  }, []);

  const shownName = name || defaultRouteName(period, period === 'week' ? mondayOf(startsOn) : startsOn);
  const p = progress({ stops });
  const nextStop = stops.find(s => s.status === 'planned');
  const current = route ? routeIsCurrent(route, today) : false;
  const url = directionsUrl(stops);

  function change(fn: () => void) {
    fn();
    setDirty(true);
  }

  function addStop(s: Omit<RouteStop, 'id' | 'status' | 'visit_id' | 'visited_at'>) {
    if (stops.some(x => (x.ref && x.ref === s.ref) || (Math.abs(x.lat - s.lat) < 0.0001 && Math.abs(x.lng - s.lng) < 0.0001))) return;
    change(() => setStops(prev => [...prev, { ...s, id: crypto.randomUUID(), status: 'planned', visit_id: null, visited_at: null }]));
  }

  function search(text: string) {
    setQ(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const at = pos || stops[stops.length - 1];
      const qs = new URLSearchParams({ q: text.trim(), ...(at ? { lat: String(at.lat), lng: String(at.lng) } : {}) });
      const json = await fetch(`/api/field/search?${qs}`).then(r => r.json()).catch(() => ({ results: [] }));
      setResults(json.results || []);
      setSearching(false);
    }, 350);
  }

  async function resolve(lines: string[]): Promise<{ line: string; place: SearchResult | null }[]> {
    const near = pos || stops[stops.length - 1] || null;
    const out: { line: string; place: SearchResult | null }[] = [];
    for (let i = 0; i < lines.length; i += 4) {
      const res = await fetch('/api/field/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: lines.slice(i, i + 4), ...(near ? { lat: near.lat, lng: near.lng } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Couldn’t look those up');
      out.push(...(json.results || []));
    }
    return out;
  }

  /** The name to give a stop placed from a line: what was typed, unless a real venue matched. */
  const stopName = (line: string, p: SearchResult) =>
    p.source === 'postcode' || p.source === 'area'
      ? line.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '').split(/\s*[,|–—]\s*|\s+-\s+/)[0].replace(/^[\s\-•*·\d.)]+/, '').trim() || p.name
      : p.name;

  /** Search found nothing right: place it from what was typed, or by a tap on the map. */
  async function addAnyway(text: string) {
    try {
      const [{ place }] = await resolve([text]);
      if (place) {
        addStop({ venue_name: stopName(text, place), address: place.address, postcode: place.postcode, lat: place.lat, lng: place.lng, ref: place.ref });
        setQ(''); setResults([]);
        return;
      }
    } catch { /* fall through to a map tap */ }
    setPinFor(text.split(/\s*,\s*/)[0] || text);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Each line of the notes → a stop where it can be found; the rest stay in the notes. */
  async function notesToStops() {
    const lines = notes.split(/\n|;/).map(l => l.trim()).filter(l => l.replace(/[^a-z0-9]/gi, '').length >= 3);
    if (!lines.length) return;
    setResolving(true);
    setNotesMsg(`Looking up ${lines.length} venue${lines.length === 1 ? '' : 's'}…`);
    try {
      const results = await resolve(lines);
      const found = results.filter(r => r.place);
      const missed = results.filter(r => !r.place).map(r => r.line);
      for (const r of found) {
        const p = r.place!;
        addStop({ venue_name: stopName(r.line, p), address: p.address, postcode: p.postcode, lat: p.lat, lng: p.lng, ref: p.ref });
      }
      change(() => setNotes(missed.join('\n')));
      const approx = found.filter(r => r.place!.source === 'postcode' || r.place!.source === 'area').length;
      setNotesMsg(
        `Added ${found.length} of ${lines.length} as stops${approx ? ` (${approx} placed by postcode or area: check the pin)` : ''}.` +
        (missed.length ? ` ${missed.length} couldn’t be found and are left in the notes: add each with “Add it anyway” and a tap on the map.` : '') +
        ' Remember to save.',
      );
    } catch (e) {
      setNotesMsg(e instanceof Error ? e.message : 'Couldn’t look those up. Try again.');
    } finally {
      setResolving(false);
    }
  }

  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= stops.length) return;
    change(() => setStops(prev => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }));
  }

  function setStatus(id: string, status: RouteStop['status']) {
    change(() => setStops(prev => prev.map(s => (s.id === id ? { ...s, status } : s))));
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    setError('');
    const body = {
      name: shownName,
      period,
      starts_on: period === 'week' ? mondayOf(startsOn) : startsOn,
      stops,
      notes,
      agent_id: agentId,
    };
    const res = await fetch(route ? `/api/field/routes/${route.id}` : '/api/field/routes', {
      method: route ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) { setError(json?.error || 'Couldn’t save. Check your signal and try again.'); return false; }
    setDirty(false);
    if (!route) router.replace(`/field/routes/${json.id}`);
    else router.refresh();
    return true;
  }

  async function remove() {
    if (!route || !confirm('Delete this route? Visits made on it are kept.')) return;
    const res = await fetch(`/api/field/routes/${route.id}`, { method: 'DELETE' });
    if (res.ok) { router.replace('/field/routes'); router.refresh(); }
  }

  // Map: numbered stops in order, the planned line, where they actually went,
  // and (while planning) the team's known venues to tap onto the route.
  const pins: MapPin[] = useMemo(() => {
    const out: MapPin[] = [];
    if (showKnown) {
      const onRoute = new Set(stops.map(s => s.ref).filter(Boolean));
      for (const k of known) {
        if (onRoute.has(k.osm_ref) || onRoute.has(`visit/${k.id}`)) continue;
        out.push({ id: `k:${k.id}`, lat: k.lat, lng: k.lng, label: `${k.venue_name} (tap to add)`, tone: 'place' });
      }
    }
    if (showTargets) {
      const onRoute = stops.map(st => `${st.lat.toFixed(5)},${st.lng.toFixed(5)}`);
      for (const t of targets) {
        if (onRoute.includes(`${t.lat.toFixed(5)},${t.lng.toFixed(5)}`)) continue;
        out.push({ id: `g:${t.id}`, lat: t.lat, lng: t.lng, label: `${t.name} · target (tap to add)`, tone: 'place', color: '#0E7C86', hollow: true });
      }
    }
    for (const v of actual) {
      if (v.lat == null || v.lng == null) continue;
      out.push({ id: `a:${v.id}`, lat: v.lat, lng: v.lng, label: `Visited: ${v.venue_name} · ${fmtWhen(v.visited_at)}`, tone: 'visited', color: '#167034' });
    }
    stops.forEach((s, i) => out.push({
      id: `s:${s.id}`, lat: s.lat, lng: s.lng, label: `${i + 1}. ${s.venue_name}`,
      tone: s.id === nextStop?.id ? 'selected' : 'visited',
      color: s.status === 'visited' ? '#167034' : s.status === 'skipped' ? '#827D74' : '#38278F',
      hollow: s.status === 'planned' && s.id !== nextStop?.id,
    }));
    return out;
  }, [stops, known, actual, showKnown, showTargets, targets, nextStop?.id]);

  const trails = [
    ...(stops.length > 1 ? [{ id: 'plan', color: '#FF5014', points: stops.map(s => ({ lat: s.lat, lng: s.lng })) }] : []),
    ...(actual.filter(v => v.lat != null).length > 1 ? [{
      id: 'actual', color: '#167034',
      points: [...actual].filter(v => v.lat != null && v.lng != null).sort((a, b) => a.visited_at.localeCompare(b.visited_at)).map(v => ({ lat: v.lat!, lng: v.lng! })),
    }] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-4 md:max-w-2xl">
      {/* Running today: the next stop, front and centre */}
      {current && nextStop && (
        <section className="mb-4 rounded-2xl bg-ink p-4 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/70">Next stop · {p.done} of {p.total} done</p>
          <p className="mt-1 text-[20px] font-bold leading-tight">{nextStop.venue_name}</p>
          {nextStop.address && <p className="text-[14px] text-white/75">{nextStop.address}</p>}
          <div className="mt-3 flex gap-2">
            <Link href={`/field/visit?route=${route!.id}&stop=${nextStop.id}`}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-primary text-[15px] font-bold uppercase text-white active:bg-primary-press">
              Start visit here
            </Link>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-xl bg-white/15 px-4 text-[14px] font-bold">
                Directions
              </a>
            )}
          </div>
        </section>
      )}
      {route && p.total > 0 && !nextStop && (
        <p className="mb-4 rounded-2xl bg-positive-tint px-4 py-3 text-[15px] font-bold text-positive">
          Route complete: {p.done} visited{p.skipped ? `, ${p.skipped} skipped` : ''}.
        </p>
      )}

      <section className="mb-4 flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex gap-2">
          <Chip on={period === 'day'} onClick={() => change(() => setPeriod('day'))}>Day</Chip>
          <Chip on={period === 'week'} onClick={() => change(() => setPeriod('week'))}>Week</Chip>
          <input type="date" value={startsOn} onChange={e => change(() => setStartsOn(e.target.value))}
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-[15px]" />
        </div>
        <input className={INPUT} value={name} onChange={e => change(() => setName(e.target.value))} placeholder={shownName} />
        {me.role === 'manager' && agents.length > 1 && (
          <div>
            <p className={LABEL}>Route for</p>
            <div className="flex flex-wrap gap-2">
              {agents.filter(a => a.active).map(a => (
                <Chip key={a.id} on={agentId === a.id} onClick={() => change(() => setAgentId(a.id))}>{a.name || a.email.split('@')[0]}</Chip>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="relative -mx-4 mb-3 overflow-hidden sm:mx-0 sm:rounded-2xl">
        <FieldMap
          className="h-[40vh] min-h-64 w-full md:h-[48vh]"
          pins={pins}
          trails={trails}
          me={pos}
          fit
          fitIds={stops.map(s => `s:${s.id}`)}
          zoom={14}
          center={stops[0] || pos}
          onMapClick={(lat, lng) => {
            if (!pinFor) return;
            addStop({ venue_name: pinFor, address: '', postcode: '', lat, lng, ref: null });
            setPinFor(null);
            setQ('');
            setResults([]);
          }}
          onPinClick={id => {
            if (id.startsWith('g:')) {
              const t = targets.find(x => x.id === id.slice(2));
              if (t) addStop({ venue_name: t.name, address: t.address || '', postcode: t.postcode || '', lat: t.lat, lng: t.lng, ref: null });
              return;
            }
            if (id.startsWith('k:')) {
              const k = known.find(x => x.id === id.slice(2));
              if (k) addStop({ venue_name: k.venue_name, address: k.address || '', postcode: k.postcode || '', lat: k.lat, lng: k.lng, ref: k.osm_ref || `visit/${k.id}` });
            }
          }}
        />
        <div className="absolute top-3 left-3 z-[500] flex flex-col gap-2">
          <button type="button" onClick={() => setShowKnown(!showKnown)}
            className={`h-10 rounded-full px-4 text-[13px] font-bold shadow ${showKnown ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
            Known venues {showKnown ? 'on' : 'off'}
          </button>
          {targets.length > 0 && (
            <button type="button" onClick={() => setShowTargets(!showTargets)}
              className={`h-10 rounded-full px-4 text-[13px] font-bold shadow ${showTargets ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
              Targets {showTargets ? 'on' : 'off'}
            </button>
          )}
        </div>
      </div>
      <p className="mb-4 text-[13px] text-muted">
        <span className="font-bold text-primary">Orange line</span>: the plan.
        {actual.length > 0 && <> <span className="font-bold text-positive">Green</span>: where {route?.agent_name || 'they'} actually went.</>}
        {showKnown && ' Tap a white pin to add that venue.'}
        {showTargets && targets.length > 0 && <> <span className="font-bold text-[#0E7C86]">Teal rings</span>: targets not visited yet; tap to add.</>}
      </p>

      {targets.length > 0 && (
        <button type="button" onClick={() => {
          // The ten nearest targets to here (or the last stop) not already on the route, in a sensible order.
          const from = pos || stops[stops.length - 1] || null;
          if (!from) { alert('Turn on location, or add a first stop, so the nearest targets can be found.'); return; }
          const taken = new Set(stops.map(st => `${st.lat.toFixed(5)},${st.lng.toFixed(5)}`));
          const near = targets
            .filter(t => !taken.has(`${t.lat.toFixed(5)},${t.lng.toFixed(5)}`))
            .map(t => ({ t, d: distanceM(from.lat, from.lng, t.lat, t.lng) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 10);
          if (!near.length) return;
          change(() => setStops(prev => bestOrder([
            ...prev,
            ...near.map(({ t }) => ({ id: crypto.randomUUID(), venue_name: t.name, address: t.address || '', postcode: t.postcode || '', lat: t.lat, lng: t.lng, ref: null, status: 'planned' as const, visit_id: null, visited_at: null })),
          ], pos)));
        }} className="mb-4 flex h-12 w-full items-center justify-center rounded-2xl border-2 border-[#0E7C86] text-[15px] font-bold text-[#0E7C86] active:bg-surface">
          Add 10 nearest targets
        </button>
      )}

      {/* Add stops */}
      <section className="mb-4">
        <label className={LABEL} htmlFor="stop-search">Add a stop</label>
        <input id="stop-search" className={INPUT} value={q} onChange={e => search(e.target.value)} placeholder="Search a venue, street or area" autoComplete="off" />
        {(searching || results.length > 0) && (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl bg-surface">
            {searching && !results.length && <li className="px-4 py-3 text-[14px] text-muted">Searching…</li>}
            {results.map((r, i) => (
              <li key={`${r.ref}-${i}`}>
                <button type="button" onClick={() => { addStop({ venue_name: r.name, address: r.address, postcode: r.postcode, lat: r.lat, lng: r.lng, ref: r.ref }); setQ(''); setResults([]); }}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{r.name}</span>
                    <span className="block truncate text-[13px] text-muted">{[r.address, r.postcode].filter(Boolean).join(' · ')}</span>
                  </span>
                  {r.source && SOURCE_TAG[r.source] && <span className="shrink-0 rounded-full bg-tag-advisory px-2 py-0.5 text-[11px] font-bold">{SOURCE_TAG[r.source]}</span>}
                  <span className="shrink-0 text-[22px] font-bold text-ink">+</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 3 && !searching && (
          <button type="button" onClick={() => addAnyway(q.trim())}
            className="mt-2 flex min-h-12 w-full items-center gap-2 rounded-2xl border-2 border-dashed border-ink/40 px-4 text-left text-[14px] font-bold active:bg-surface">
            <span className="text-[20px]">+</span> Not listed? Add “{q.trim()}” anyway
          </button>
        )}
        {pinFor && (
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-[14px] text-white">
            <span className="flex-1">Tap the map where <b>{pinFor}</b> is.</span>
            <button type="button" onClick={() => setPinFor(null)} className="h-9 rounded-full bg-white/15 px-3 text-[13px] font-bold">Cancel</button>
          </div>
        )}
      </section>

      {/* Stops, in order */}
      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className={LABEL + ' mb-0'}>Stops · {p.total}</h2>
          {stops.filter(s => s.status === 'planned').length > 2 && (
            <button type="button" onClick={() => change(() => setStops(bestOrder(stops, pos)))} className="h-10 px-2 text-[14px] font-bold text-ink underline underline-offset-4">
              Best order
            </button>
          )}
        </div>
        {stops.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-[15px] text-muted">
            No stops yet. Search above, or tap venues on the map.
          </p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
            {stops.map((s, i) => (
              <li key={s.id} className={`flex items-center gap-2 px-3 py-2.5 ${s.status === 'skipped' ? 'opacity-50' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                  s.status === 'visited' ? 'bg-positive text-white' : s.id === nextStop?.id ? 'bg-primary text-white' : 'border-2 border-ink'}`}>
                  {s.status === 'visited' ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[15px] font-bold ${s.status === 'skipped' ? 'line-through' : ''}`}>{s.venue_name}</p>
                  <p className="truncate text-[12px] text-muted">
                    {s.status === 'visited' && s.visited_at ? `Visited ${fmtWhen(s.visited_at)}` : [s.address, s.postcode].filter(Boolean).join(' · ') || 'Pinned on the map'}
                  </p>
                </div>
                {s.status === 'visited' && s.visit_id ? (
                  <Link href={`/field/visits/${s.visit_id}`} className="h-10 shrink-0 rounded-full border border-border px-3 text-[13px] font-bold leading-10">Open</Link>
                ) : (
                  <div className="flex shrink-0 items-center">
                    {route && s.status === 'planned' && (
                      <Link href={`/field/visit?route=${route.id}&stop=${s.id}`} aria-label={`Start visit at ${s.venue_name}`}
                        className="grid h-10 w-10 place-items-center rounded-full text-primary active:bg-surface-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      </Link>
                    )}
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-10 w-9 place-items-center disabled:opacity-25">↑</button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === stops.length - 1} className="grid h-10 w-9 place-items-center disabled:opacity-25">↓</button>
                    <button type="button" aria-label={s.status === 'skipped' ? 'Put back' : 'Skip'} onClick={() => setStatus(s.id, s.status === 'skipped' ? 'planned' : 'skipped')}
                      className="h-10 px-2 text-[12px] font-bold text-muted">{s.status === 'skipped' ? 'Undo' : 'Skip'}</button>
                    <button type="button" aria-label="Remove" onClick={() => change(() => setStops(prev => prev.filter(x => x.id !== s.id)))}
                      className="grid h-10 w-9 place-items-center text-[20px] text-muted">×</button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mb-4">
        <label className={LABEL} htmlFor="route-notes">Notes</label>
        <textarea id="route-notes" rows={3} value={notes} onChange={e => change(() => setNotes(e.target.value))}
          placeholder="Anything for the day, or a list of venues (one per line) to turn into stops"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[16px] placeholder:text-dim focus:border-ink focus:outline-none" />
        {notes.trim() && (
          <button type="button" disabled={resolving} onClick={notesToStops}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl border border-ink text-[15px] font-bold active:bg-surface disabled:opacity-50">
            {resolving ? 'Finding venues…' : 'Turn notes into stops'}
          </button>
        )}
        {notesMsg && <p className="mt-2 text-[14px]" role="status">{notesMsg}</p>}
      </section>

      {error && <p role="alert" className="mb-3 rounded-xl bg-negative-tint px-4 py-3 text-[15px] text-negative-dark">{error}</p>}

      <div className="mb-4 flex gap-2">
        {url && !current && (
          <a href={url} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center rounded-2xl border border-border px-4 text-[15px] font-bold">
            Directions
          </a>
        )}
        <button type="button" onClick={save} disabled={saving || (!dirty && Boolean(route))}
          className="h-14 flex-1 rounded-2xl bg-primary text-[16px] font-bold uppercase text-white active:bg-primary-press disabled:opacity-40">
          {saving ? 'Saving…' : route ? (dirty ? 'Save changes' : 'Saved') : 'Save route'}
        </button>
        {route && (
          <button type="button" onClick={remove} className="h-14 rounded-2xl border border-negative/40 px-4 text-[15px] font-bold text-negative">Delete</button>
        )}
      </div>
    </main>
  );
}

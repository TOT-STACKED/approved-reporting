'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from './FieldChrome';
import { TARGET_PRESETS, sourceLabel, type TargetList } from '@/lib/field-targets-shared';

// Managers: add a brand or group as a target list. Venues come from All The
// Places (each brand's own venue finder, refreshed weekly), loaded one brand
// at a time. Refresh re-loads them to pick up openings and closures.

const INPUT = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] placeholder:text-dim focus:border-ink focus:outline-none';

export default function TargetsAdmin({ lists }: { lists: TargetList[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<'pubs' | 'restaurants'>('pubs');
  const [name, setName] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ spider: string; count: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(text: string) {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 3) { setFound([]); return; }
    timer.current = setTimeout(async () => {
      const json = await fetch(`/api/field/targets?q=${encodeURIComponent(text.trim())}`).then(r => r.json()).catch(() => ({}));
      setFound(json.sources || []);
    }, 400);
  }

  async function load(listId: string, srcs: string[], label: string) {
    setBusy(listId);
    let total = 0;
    try {
      for (let i = 0; i < srcs.length; i++) {
        setMsg(`Loading ${label}: ${sourceLabel(srcs[i])} (${i + 1} of ${srcs.length})…`);
        const res = await fetch(`/api/field/targets/${listId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: srcs[i], last: i === srcs.length - 1 }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Couldn’t load it');
        total += json.saved;
      }
      setMsg(`${label}: ${total} venues on the map as targets.`);
      router.refresh();
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : 'Something went wrong'}. Press Refresh to try again.`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/field/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sources }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(json.error || 'Couldn’t add it.'); return; }
    const label = name;
    const srcs = sources;
    setName(''); setSources([]); setQ(''); setFound([]);
    await load(json.id, srcs, label);
  }

  async function remove(l: TargetList) {
    if (!confirm(`Remove ${l.name} targets from the map? Visits stay.`)) return;
    await fetch(`/api/field/targets/${l.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="mb-6 rounded-2xl border-2 border-dashed border-border p-4">
      <h2 className="mb-1 text-[16px] font-bold">Targets</h2>
      <p className="mb-3 text-[14px] text-muted">
        Put a brand’s venues on the map as targets, e.g. every Greene King pub. They tick off as the team visits them.
        Venues come from each brand’s own venue finder, via All The Places, refreshed weekly.
      </p>

      {lists.length > 0 && (
        <ul className="mb-4 divide-y divide-border overflow-hidden rounded-2xl bg-surface">
          {lists.map(l => {
            const done = l.visited + l.reviewed;
            return (
              <li key={l.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[16px] font-bold">{l.name}</p>
                  <p className="shrink-0 font-mono text-[14px]">{done} / {l.total}</p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-positive" style={{ width: `${l.total ? (done / l.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  {l.visited} visited · {l.reviewed} with an Intelligence Review · {l.total - done} to go
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={Boolean(busy)} onClick={() => load(l.id, l.sources, l.name)} className="h-10 rounded-full border border-border px-3 text-[13px] font-bold disabled:opacity-40">
                    {busy === l.id ? 'Loading…' : 'Refresh'}
                  </button>
                  <button type="button" disabled={Boolean(busy)} onClick={() => remove(l)} className="h-10 rounded-full border border-border px-3 text-[13px] font-bold text-negative disabled:opacity-40">
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Add a brand or group</p>
        <div className="flex gap-2">
          <Chip on={kind === 'pubs'} onClick={() => setKind('pubs')}>Pub groups</Chip>
          <Chip on={kind === 'restaurants'} onClick={() => setKind('restaurants')}>Restaurants</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          {TARGET_PRESETS.filter(p => p.kind === kind && !lists.some(l => l.name === p.name)).map(p => (
            <Chip key={p.name} on={name === p.name} onClick={() => { setName(p.name); setSources(p.sources); }}>
              {p.name} <span className="text-[12px] opacity-60">~{p.about}</span>
            </Chip>
          ))}
        </div>

        <div>
          <input className={INPUT} value={q} onChange={e => search(e.target.value)} placeholder="Or find another brand, e.g. toby, beefeater" autoComplete="off" />
          {found.length > 0 && (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {found.map(f => {
                const on = sources.includes(f.spider);
                return (
                  <li key={f.spider}>
                    <button type="button" onClick={() => {
                      const next = on ? sources.filter(x => x !== f.spider) : [...sources, f.spider];
                      setSources(next);
                      if (!name.trim() && !on) setName(sourceLabel(f.spider));
                    }} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-[13px] font-bold ${on ? 'border-ink bg-ink text-white' : 'border-border'}`}>{on ? '✓' : ''}</span>
                      <span className="flex-1 text-[15px]">{sourceLabel(f.spider)}</span>
                      <span className="font-mono text-[13px] text-muted">{f.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {sources.length > 0 && (
          <>
            <input className={INPUT} placeholder="List name" value={name} onChange={e => setName(e.target.value)} />
            <p className="text-[13px] text-muted">Brands on this list: {sources.map(sourceLabel).join(', ')}</p>
          </>
        )}
        <button disabled={Boolean(busy) || !name.trim() || !sources.length} className="h-12 rounded-xl bg-primary text-[15px] font-bold uppercase text-white disabled:opacity-50">
          {busy ? 'Working…' : 'Add to the map'}
        </button>
      </form>
      {msg && <p className="mt-3 text-[14px]" role="status">{msg}</p>}
    </section>
  );
}

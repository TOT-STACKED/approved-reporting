'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from './FieldChrome';
import { fmtWhen, type FieldAgent } from '@/lib/field-shared';

const INPUT = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] placeholder:text-dim focus:border-ink focus:outline-none';

export default function TeamView({ agents, meId, imported }: { agents: FieldAgent[]; meId: string; imported: number }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'agent' | 'manager'>('agent');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/field/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, role }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(json.error || 'Couldn’t add them.'); return; }
    setMsg(`${name || email} can now sign in at partners.wearestacked.io/field with ${email}.`);
    setName(''); setEmail(''); setRole('agent');
    router.refresh();
  }

  async function patch(id: string, body: object) {
    const res = await fetch('/api/field/agents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error || 'Couldn’t update.');
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Agents</h2>
      <ul className="mb-6 divide-y divide-border overflow-hidden rounded-2xl bg-surface">
        {agents.map(a => (
          <li key={a.id} className={`px-4 py-3 ${a.active ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold">{a.name || a.email}{a.id === meId ? ' (you)' : ''}</p>
                <p className="truncate text-[13px] text-muted">
                  {a.email} · {a.role === 'manager' ? 'Manager' : 'Agent'}
                  {a.last_sign_in_at ? ` · in ${fmtWhen(a.last_sign_in_at)}` : ' · not signed in yet'}
                </p>
              </div>
            </div>
            {a.id !== meId && (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => patch(a.id, { role: a.role === 'manager' ? 'agent' : 'manager' })} className="h-10 rounded-full border border-border px-3 text-[13px] font-bold">
                  Make {a.role === 'manager' ? 'agent' : 'manager'}
                </button>
                <button type="button" onClick={() => {
                  if (a.active && !confirm(`Switch off ${a.name || a.email}? They’ll be signed out; their visits stay.`)) return;
                  void patch(a.id, { active: !a.active });
                }} className="h-10 rounded-full border border-border px-3 text-[13px] font-bold">
                  {a.active ? 'Switch off' : 'Switch back on'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Add someone</h2>
      <form onSubmit={add} className="mb-8 flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <input className={INPUT} placeholder="Name, e.g. Caz" value={name} onChange={e => setName(e.target.value)} />
        <input className={INPUT} type="email" inputMode="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <div className="flex gap-2">
          <Chip on={role === 'agent'} onClick={() => setRole('agent')}>Agent</Chip>
          <Chip on={role === 'manager'} onClick={() => setRole('manager')}>Manager</Chip>
        </div>
        <button disabled={busy} className="h-12 rounded-xl bg-primary text-[15px] font-bold uppercase text-white disabled:opacity-60">{busy ? 'Adding…' : 'Add to team'}</button>
        {msg && <p className="text-[14px]">{msg}</p>}
      </form>

      <ImportHistory agents={agents.filter(a => a.active)} imported={imported} />
    </main>
  );
}

/** Bring every Intelligence Review in as a back-dated visit, a batch at a time. */
function ImportHistory({ agents, imported }: { agents: FieldAgent[]; imported: number }) {
  const router = useRouter();
  const [agent, setAgent] = useState(() => agents.find(a => /^caz/i.test(a.name || a.email))?.id || '');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [unplaced, setUnplaced] = useState<{ id: string; name: string; location: string }[]>([]);
  const [err, setErr] = useState('');

  async function run() {
    setRunning(true);
    setErr('');
    let count = 0;
    const missed: typeof unplaced = [];
    try {
      for (let i = 0; i < 60; i++) {
        const res = await fetch('/api/field/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(json.error || 'The import stopped. Press it again to carry on.'); break; }
        count += json.imported;
        for (const u of json.unplaced || []) missed.push(u);
        setDone(count);
        setLeft(json.remaining);
        setUnplaced([...missed]);
        if (!json.remaining) break;
      }
    } catch {
      setErr('Lost connection. Press it again to carry on — nothing is doubled up.');
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <section className="mb-6 rounded-2xl border-2 border-dashed border-border p-4">
      <h2 className="mb-1 text-[16px] font-bold">Intelligence history</h2>
      <p className="mb-3 text-[14px] text-muted">
        Put every Intelligence Review on the map as a back-dated visit. {imported ? `${imported} already imported. ` : ''}
        Safe to run again: it only adds reviews that aren’t in yet.
      </p>
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted" htmlFor="imp-agent">Credit them to</label>
      <select id="imp-agent" value={agent} onChange={e => setAgent(e.target.value)} className="mb-3 h-12 w-full rounded-xl border border-border bg-surface px-3 text-[16px]">
        <option value="">Pick an agent…</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
      </select>
      <button type="button" disabled={!agent || running} onClick={run}
        className="h-12 w-full rounded-xl bg-ink text-[15px] font-bold text-white disabled:opacity-40">
        {running ? `Importing… ${done} added${left != null ? `, ${left} to go` : ''}` : 'Import Intelligence history'}
      </button>
      {!running && left === 0 && <p className="mt-3 text-[14px] font-bold text-positive">Done: {done} added.</p>}
      {err && <p className="mt-3 text-[14px] text-negative">{err}</p>}
      {unplaced.length > 0 && (
        <div className="mt-3 text-[13px]">
          <p className="mb-1 font-bold">{unplaced.length} came in without a location (listed on the Team map under “No location yet”):</p>
          <ul className="max-h-48 overflow-auto rounded-xl bg-surface p-3">
            {unplaced.map(u => <li key={u.id}>{u.name}{u.location ? ` — “${u.location}”` : ''}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

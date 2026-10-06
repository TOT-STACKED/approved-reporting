'use client';

import { useState } from 'react';
import type { Member } from '@/lib/renewals-db';

// Who's on the account, and who gets the notice-period emails. Anyone can add
// a colleague; only the owner can remove one.
export default function RenewalsTeam({ orgName, initialMembers, me }: { orgName: string; initialMembers: Member[]; me: Member }) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const mine = members.find(m => m.id === me.id) || me;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/renewals/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not add them.');
      } else {
        setMembers(prev => [...prev, json.member]);
        setNotice(`Added ${json.member.email}. We've emailed them a link to sign in.`);
        setEmail('');
        setName('');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAlerts() {
    const next = !mine.alerts;
    setMembers(prev => prev.map(m => (m.id === me.id ? { ...m, alerts: next } : m)));
    await fetch('/api/renewals/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts: next }),
    }).catch(() => {});
  }

  async function remove(id: string) {
    const res = await fetch(`/api/renewals/team?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setMembers(prev => prev.filter(m => m.id !== id));
  }

  const input = 'w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20';

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <p className="text-xs uppercase tracking-[0.12em] text-muted mb-1">{orgName}</p>
      <h1 className="font-display uppercase text-3xl sm:text-4xl leading-none mb-8">Team</h1>

      <section className="bg-surface border border-border rounded-[18px] p-5 mb-6">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted mb-3">Your alerts</h2>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={mine.alerts} onChange={toggleAlerts} className="w-4 h-4 accent-ink" />
          Email me 60, 30, 14, 7 and 1 day before a notice deadline
        </label>
      </section>

      <section className="bg-surface border border-border rounded-[18px] mb-6">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted p-5 pb-3">People</h2>
        <ul className="divide-y divide-border">
          {members.map(m => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{m.name || m.email}{m.id === me.id && <span className="text-muted font-normal"> (you)</span>}</span>
                {m.name && <span className="block text-xs text-muted truncate">{m.email}</span>}
              </span>
              <span className="text-xs text-muted">{m.role === 'owner' ? 'Owner' : m.alerts ? 'Gets alerts' : 'Alerts off'}</span>
              {me.role === 'owner' && m.role !== 'owner' && (
                <button onClick={() => remove(m.id)} className="text-xs text-muted underline">Remove</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface border border-border rounded-[18px] p-5">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted mb-3">Add a colleague</h2>
        <p className="text-sm text-muted mb-4">Free, as many as you like. They&apos;ll see everything on this account and get the alert emails.</p>
        <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className={input} />
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@yourvenue.com" className={input} />
          <button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover active:bg-primary-press disabled:opacity-50 text-white rounded-full px-5 py-2.5 text-sm font-semibold">
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && <p className="text-sm text-negative-dark mt-3">{error}</p>}
        {notice && <p className="text-sm text-positive mt-3">{notice}</p>}
      </section>
    </main>
  );
}

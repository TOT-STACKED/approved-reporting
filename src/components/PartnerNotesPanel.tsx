'use client';

import { useState } from 'react';
import type { PartnerNote } from '@/lib/use-partner-notes';

// Notes for one partner, opened from their Partner Health row. Internal only.

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function FlagIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21V4m0 0h11l-1.5 4L15 12H4" />
    </svg>
  );
}

interface Props {
  partnerName: string;
  notes: PartnerNote[];
  author: string;
  onAuthor: (v: string) => void;
  onAdd: (body: string, isAction: boolean) => Promise<boolean>;
  onDone: (id: string, done: boolean) => Promise<boolean>;
  saved: boolean;
}

export default function PartnerNotesPanel({ partnerName, notes, author, onAuthor, onAdd, onDone, saved }: Props) {
  const [body, setBody] = useState('');
  const [isAction, setIsAction] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openActions = notes.filter(n => n.is_action && !n.done_at);
  const rest = notes.filter(n => !(n.is_action && !n.done_at));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setError('Write a note first.'); return; }
    if (!author.trim()) { setError('Add your name so the team knows who wrote it.'); return; }
    setBusy(true);
    const ok = await onAdd(body.trim(), isAction);
    setBusy(false);
    if (ok) { setBody(''); setError(''); }
    else setError(saved ? 'That note didn’t save. Try again.' : 'Notes aren’t switched on yet (database table missing).');
  }

  return (
    <div className="mt-2.5 rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-3">
      {openActions.length > 0 && (
        <ul className="space-y-2" aria-label={`Open actions for ${partnerName}`}>
          {openActions.map(n => (
            <li key={n.id} className="flex items-start gap-2 rounded-lg bg-warning-tint/70 border border-warning/40 px-3 py-2">
              <FlagIcon className="w-4 h-4 mt-0.5 shrink-0 text-warning-dark" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{n.body}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{n.author || 'Someone'} · {when(n.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => onDone(n.id, true)}
                className="shrink-0 text-[11px] font-medium text-positive border border-positive/40 hover:bg-positive-tint rounded-full px-2.5 py-1.5 min-h-[32px]"
              >
                Mark done
              </button>
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <ul className="space-y-1.5" aria-label={`Notes for ${partnerName}`}>
          {rest.slice(0, 6).map(n => (
            <li key={n.id} className={`text-sm px-1 ${n.done_at ? 'text-gray-400' : 'text-gray-700'}`}>
              <span className="whitespace-pre-wrap break-words">{n.done_at ? <s>{n.body}</s> : n.body}</span>
              <span className="block text-[11px] text-gray-400">
                {n.author || 'Someone'} · {when(n.created_at)}
                {n.done_at && <> · done {when(n.done_at)}{n.done_by ? ` by ${n.done_by}` : ''} · <button type="button" className="underline" onClick={() => onDone(n.id, false)}>reopen</button></>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <label className="block">
          <span className="sr-only">New note for {partnerName}</span>
          <textarea
            value={body}
            onChange={e => { setBody(e.target.value); if (error) setError(''); }}
            rows={2}
            maxLength={2000}
            placeholder="Chase renewal call with their head of partnerships"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-700 min-h-[32px]">
            <input type="checkbox" checked={isAction} onChange={e => setIsAction(e.target.checked)} className="w-4 h-4" />
            Flag as an action
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span>Your name</span>
            <input
              value={author}
              onChange={e => { onAuthor(e.target.value); if (error) setError(''); }}
              maxLength={80}
              placeholder="Name"
              className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto text-xs font-semibold text-white bg-brand-green hover:bg-brand-green/90 rounded-full px-4 py-2 min-h-[36px]"
          >
            {busy ? 'Saving…' : 'Save note'}
          </button>
        </div>
        {error && <p className="text-xs text-negative-dark" role="alert">{error}</p>}
      </form>
    </div>
  );
}

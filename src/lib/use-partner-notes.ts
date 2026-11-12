'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

// Team notes on partners (internal dashboard only). See /api/partner-notes.

export interface PartnerNote {
  id: string;
  slug: string;
  body: string;
  author: string | null;
  is_action: boolean;
  created_at: string;
  done_at: string | null;
  done_by: string | null;
}

const NAME_KEY = 'noteAuthor';

/** The name this browser signs notes with. Shared team login, so we ask once.
 *  Kept in localStorage and shared across every component on the page. */
const authorListeners = new Set<() => void>();
function readAuthor(): string {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function subscribeAuthor(cb: () => void) {
  authorListeners.add(cb);
  return () => { authorListeners.delete(cb); };
}
export function useNoteAuthor(): [string, (v: string) => void] {
  const name = useSyncExternalStore(subscribeAuthor, readAuthor, () => '');
  const save = useCallback((v: string) => {
    try { localStorage.setItem(NAME_KEY, v); } catch {}
    authorListeners.forEach(l => l());
  }, []);
  return [name, save];
}

export function usePartnerNotes() {
  const [notes, setNotes] = useState<PartnerNote[] | null>(null);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    fetch('/api/partner-notes', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setNotes(d.notes || []); setSaved(Boolean(d.saved)); })
      .catch(() => { setNotes([]); setSaved(false); });
  }, []);

  const addNote = useCallback(async (slug: string, body: string, isAction: boolean, author: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/partner-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, body, isAction, author }),
      });
      if (!res.ok) return false;
      const { note } = await res.json();
      if (note) setNotes(prev => [note, ...(prev || [])]);
      return Boolean(note);
    } catch {
      return false;
    }
  }, []);

  const setDone = useCallback(async (id: string, done: boolean, by: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/partner-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done, by }),
      });
      if (!res.ok) return false;
      const { note } = await res.json();
      if (note) setNotes(prev => (prev || []).map(n => (n.id === id ? note : n)));
      return Boolean(note);
    } catch {
      return false;
    }
  }, []);

  const bySlug = useMemo(() => {
    const m = new Map<string, PartnerNote[]>();
    for (const n of notes || []) {
      if (!m.has(n.slug)) m.set(n.slug, []);
      m.get(n.slug)!.push(n);
    }
    return m;
  }, [notes]);

  return { notes, bySlug, saved, addNote, setDone };
}

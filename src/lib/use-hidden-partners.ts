'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Hidden partners, saved for the whole team via /api/hidden-partners.
//
// Before this, the list lived in each browser's localStorage, so a partner
// hidden on one laptop showed up again everywhere else. On first load any
// partners still in this browser's old list are moved up to the shared list.
// If the shared table isn't there yet, it falls back to the browser list so
// hiding keeps working.

const LOCAL_KEY = 'hiddenPartners';

export interface HiddenPartner {
  slug: string;
  name: string | null;
  hidden_at: string | null;
}

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]) {
  try {
    if (slugs.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(slugs));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {}
}

async function save(slug: string, name: string | null, hidden: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/hidden-partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, name, hidden }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useHiddenPartners() {
  const [hidden, setHidden] = useState<HiddenPartner[]>([]);
  // true once we know the shared list works; false = this browser only.
  const [shared, setShared] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readLocal();
      let rows: HiddenPartner[] = [];
      let saved = false;
      try {
        const res = await fetch('/api/hidden-partners', { cache: 'no-store' });
        const data = await res.json();
        rows = data.hidden || [];
        saved = Boolean(data.saved);
      } catch {}

      if (saved) {
        // Move anything only this browser had hidden up to the shared list.
        const known = new Set(rows.map(r => r.slug));
        const toMove = local.filter(s => !known.has(s));
        const moved = await Promise.all(toMove.map(s => save(s, null, true)));
        toMove.forEach((s, i) => {
          if (moved[i]) rows.push({ slug: s, name: null, hidden_at: new Date().toISOString() });
        });
        if (moved.every(Boolean)) writeLocal([]);
      } else {
        rows = local.map(s => ({ slug: s, name: null, hidden_at: null }));
      }

      if (cancelled) return;
      setHidden(rows);
      setShared(saved);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setPartnerHidden = useCallback(async (slug: string, name: string | null, hide: boolean) => {
    const before = hidden;
    const next = hide
      ? [{ slug, name, hidden_at: new Date().toISOString() }, ...before.filter(h => h.slug !== slug)]
      : before.filter(h => h.slug !== slug);
    setHidden(next);

    if (!shared) {
      writeLocal(next.map(h => h.slug));
      return;
    }
    const ok = await save(slug, name, hide);
    if (!ok) setHidden(before);
  }, [hidden, shared]);

  const hiddenSlugs = useMemo(() => hidden.map(h => h.slug), [hidden]);
  return { hidden, hiddenSlugs, shared, ready, setPartnerHidden };
}

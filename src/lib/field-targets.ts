// Target venues for Stacked Field: lists of a brand's venues loaded from
// All The Places, and whether the team has been to each. See migration 010.

import { allRows, rest } from './field-db';
import { distanceM } from './field-shared';
import type { FieldTarget, TargetList, TargetStatus } from './field-targets-shared';

const enc = encodeURIComponent;

export class TargetInputError extends Error {}

const SPIDER = /^[a-z0-9_]{2,80}$/;

export function cleanSources(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  return [...new Set(list.map(String).filter(x => SPIDER.test(x)))].slice(0, 20);
}

export async function createTargetList(name: string, sources: string[], createdBy: string): Promise<string> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new TargetInputError('Give the list a name');
  if (!sources.length) throw new TargetInputError('Pick at least one brand');
  const [row] = await rest<{ id: string }[]>('field_target_lists?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: clean, sources, created_by: createdBy }),
  });
  return row.id;
}

export async function deleteTargetList(id: string): Promise<void> {
  await rest(`field_target_lists?id=eq.${enc(id)}`, { method: 'DELETE' });
}

// ── All The Places ──────────────────────────────────────────────────────────
//
// alltheplaces.xyz runs each brand's own venue finder weekly and publishes the
// results (CC0). One GeoJSON file per brand ("spider"), with addresses and
// postcodes. Fetched here, server side: the files aren't served for browsers.

const ATP_LATEST = 'https://data.alltheplaces.xyz/runs/latest.json';

let runCache: { base: string; at: number } | null = null;

/** The latest run's file location, e.g. https://…/runs/2026-10-10-13-32-41 */
async function latestRun(): Promise<string> {
  if (runCache && Date.now() - runCache.at < 6 * 3600 * 1000) return runCache.base;
  const res = await fetch(ATP_LATEST, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`All The Places answered ${res.status}`);
  const { output_url } = (await res.json()) as { output_url?: string };
  if (!output_url) throw new Error('All The Places has no latest run');
  runCache = { base: output_url.replace(/\/output\.zip$/, ''), at: Date.now() };
  return runCache.base;
}

let catalogue: { rows: { spider: string; count: number }[]; at: number } | null = null;

/** Brands All The Places covers in the UK, by name, with venue counts: for "find a brand". */
export async function searchSources(q: string): Promise<{ spider: string; count: number }[]> {
  if (!catalogue || Date.now() - catalogue.at > 6 * 3600 * 1000) {
    const base = await latestRun();
    const res = await fetch(`${base}/stats/_results.json`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`All The Places answered ${res.status}`);
    const json = (await res.json()) as { results?: { spider?: string; features?: number }[] };
    catalogue = {
      rows: (json.results || [])
        .filter(r => r.spider && (r.features || 0) > 0 && /(_gb|_uk|_gb_ie)$|^(j_d_wetherspoon|marstons_plc)$/.test(r.spider))
        .map(r => ({ spider: r.spider!, count: r.features || 0 })),
      at: Date.now(),
    };
  }
  const words = q.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return catalogue.rows
    .filter(r => words.every(w => r.spider.includes(w)))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

interface AtpFeature {
  geometry?: { type: string; coordinates?: [number, number] } | null;
  properties?: Record<string, string | undefined>;
}

/**
 * Load one brand's venues into a list (refreshing any already there). Takes a
 * second or two: one file, one write. `last` marks the list as synced.
 */
export async function syncSource(listId: string, spider: string, last: boolean): Promise<number> {
  if (!/^[0-9a-f-]{36}$/.test(listId) || !SPIDER.test(spider)) throw new TargetInputError('Bad request');
  const lists = await rest<{ sources: string[] }[]>(`field_target_lists?id=eq.${listId}&select=sources&limit=1`);
  if (!lists[0]?.sources.includes(spider)) throw new TargetInputError('That brand isn’t on this list');

  const base = await latestRun();
  const res = await fetch(`${base}/output/${spider}.geojson`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`All The Places answered ${res.status}`);
  const { features = [] } = (await res.json().catch(() => ({}))) as { features?: AtpFeature[] };

  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);
  const rows = features.flatMap((f, i) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry?.coordinates || [];
    // UK venues only (Nando's and Zizzi's files include Ireland).
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !p.name || (p['addr:country'] && p['addr:country'] !== 'GB')) return [];
    const street = p['addr:street_address'] || [p['addr:housenumber'], p['addr:street']].filter(Boolean).join(' ');
    return [{
      list_id: listId,
      source_ref: `${spider}:${p.ref || p['@source_uri'] || i}`.slice(0, 300),
      name: text(p.name, 200)!,
      brand: text(p.brand, 100),
      kind: text(p.amenity || p.tourism, 40),
      address: text(p['addr:full'] || [street, p['addr:city']].filter(Boolean).join(', '), 300),
      postcode: text(p['addr:postcode'], 12)?.toUpperCase() ?? null,
      website: text(p.website, 300),
      phone: text(p.phone, 40),
      lat,
      lng,
    }];
  });

  for (let i = 0; i < rows.length; i += 500) {
    await rest('field_targets?on_conflict=list_id,source_ref', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
  if (last) await rest(`field_target_lists?id=eq.${listId}`, { method: 'PATCH', body: JSON.stringify({ synced_at: new Date().toISOString() }) });
  return rows.length;
}

// ── Which targets the team has been to ──────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x) || x.slice(0, 6) === y.slice(0, 6)));
}

/**
 * Every target (optionally only some lists) with its status, matched against
 * the team's visits: within 50 m with a similar name, or within 15 m
 * whatever the name. An app visit makes it
 * 'visited'; only an imported Intelligence Review makes it 'reviewed'.
 */
export async function targetsWithStatus(listIds?: string[]): Promise<FieldTarget[]> {
  const filter = listIds?.length ? `&list_id=in.(${listIds.filter(i => /^[0-9a-f-]{36}$/.test(i)).join(',')})` : '';
  const [targets, visits] = await Promise.all([
    allRows<Omit<FieldTarget, 'status' | 'visit_id'>>(
      `field_targets?select=id,list_id,name,brand,address,postcode,website,lat,lng&order=id.asc${filter}`, 50000,
    ),
    allRows<{ id: string; venue_name: string; lat: number; lng: number; source: string }>(
      'field_visits?lat=not.is.null&select=id,venue_name,lat,lng,source&order=visited_at.desc', 50000,
    ),
  ]);

  // Visits bucketed by ~100 m squares, so each target checks only its neighbours.
  const key = (lat: number, lng: number) => `${Math.floor(lat * 1000)}:${Math.floor(lng * 600)}`;
  const buckets = new Map<string, typeof visits>();
  for (const v of visits) {
    const k = key(v.lat, v.lng);
    buckets.set(k, [...(buckets.get(k) || []), v]);
  }

  return targets.map(t => {
    let match: (typeof visits)[number] | null = null;
    {
      const by = Math.floor(t.lat * 1000);
      const bx = Math.floor(t.lng * 600);
      let best: { v: (typeof visits)[number]; d: number } | null = null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (const v of buckets.get(`${by + dy}:${bx + dx}`) || []) {
          const d = distanceM(t.lat, t.lng, v.lat, v.lng);
          if ((d <= 15 || (d <= 50 && sameName(t.name, v.venue_name))) && (!best || d < best.d)) best = { v, d };
        }
      }
      match = best?.v || null;
    }
    const status: TargetStatus = !match ? 'todo' : match.source === 'field' ? 'visited' : 'reviewed';
    return { ...t, status, visit_id: match?.id ?? null };
  });
}

export async function listTargetLists(): Promise<TargetList[]> {
  const [lists, targets] = await Promise.all([
    rest<{ id: string; name: string; sources: string[]; synced_at: string | null }[]>('field_target_lists?select=id,name,sources,synced_at&order=created_at.asc'),
    targetsWithStatus().catch(() => []),
  ]);
  return lists.map(l => {
    const mine = targets.filter(t => t.list_id === l.id);
    return {
      ...l,
      total: mine.length,
      visited: mine.filter(t => t.status === 'visited').length,
      reviewed: mine.filter(t => t.status === 'reviewed').length,
    };
  });
}

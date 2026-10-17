// Bring Intelligence Reviews into Stacked Field as back-dated visits, so the
// team map shows every venue we already know about. One visit per submission
// (field_visits.submission_id is unique), so running it again only picks up
// reviews that arrived since. Chris's call, 17 Oct 2026: assign every
// historical review to one agent (Caz); new visits carry their own agent.
//
// Reviews have no coordinates, only free-text `location` and `sites`, so each
// is placed by: a UK postcode in either field (postcodes.io, exact to the
// postcode), else the town (postcodes.io place search, the town centre). Pins
// placed by town are flagged geo_precision='town' and shown as approximate.

import { rest } from './field-db';

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const BATCH = 25;

interface Submission {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  company: string | null;
  brand_trading_name: string | null;
  location: string | null;
  sites: string | null;
  venue_type: string | null;
  site_count: number | null;
  stack: Record<string, { tools?: string[]; other?: string; none?: boolean }> | null;
}

const SUBMISSION_COLUMNS =
  'id,created_at,first_name,last_name,email,phone_number,company,brand_trading_name,location,sites,venue_type,site_count,stack';

// Review venue types → field venue type and ownership.
const TYPE_MAP: Record<string, { venue_type: string; ownership: string | null }> = {
  indie: { venue_type: 'restaurant', ownership: 'independent' },
  group: { venue_type: 'restaurant', ownership: 'group' },
  bar: { venue_type: 'bar', ownership: null },
  qsr: { venue_type: 'qsr', ownership: null },
  hotel: { venue_type: 'hotel', ownership: null },
  other: { venue_type: 'other', ownership: null },
};

interface Place { lat: number; lng: number; postcode: string | null; precision: 'postcode' | 'town' }

async function postcodeLookup(postcodes: string[]): Promise<Map<string, Place>> {
  const out = new Map<string, Place>();
  if (!postcodes.length) return out;
  const res = await fetch('https://api.postcodes.io/postcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postcodes }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return out;
  const { result } = (await res.json()) as { result: { query: string; result: { latitude: number; longitude: number; postcode: string } | null }[] };
  for (const r of result || []) {
    if (r.result) out.set(r.query, { lat: r.result.latitude, lng: r.result.longitude, postcode: r.result.postcode, precision: 'postcode' });
  }
  return out;
}

async function townLookup(text: string): Promise<Place | null> {
  // "Shoreditch, London" → try "Shoreditch", then "London".
  for (const part of text.split(/[,/;]|\band\b/i).map(s => s.trim()).filter(s => s.length > 2).slice(0, 3)) {
    const res = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(part)}&limit=1`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res?.ok) continue;
    const { result } = (await res.json()) as { result: { latitude: number; longitude: number }[] | null };
    if (result?.[0]) return { lat: result[0].latitude, lng: result[0].longitude, postcode: null, precision: 'town' };
  }
  return null;
}

function normalisePostcode(m: RegExpMatchArray): string {
  return `${m[1]} ${m[2]}`.toUpperCase();
}

function cleanStack(stack: Submission['stack']) {
  const out: Record<string, { tools: string[]; other: string; none: boolean }> = {};
  for (const [k, e] of Object.entries(stack || {})) {
    if (!e) continue;
    const tools = (e.tools || []).filter(Boolean);
    const other = (e.other || '').trim();
    if (tools.length || other || e.none) out[k] = { tools, other, none: Boolean(e.none) && !tools.length && !other };
  }
  return out;
}

export interface ImportResult {
  imported: number;
  remaining: number;
  unplaced: { id: string; name: string; location: string }[];
}

/**
 * Import the next batch of reviews not yet on the map. `skip` is the ids the
 * caller already knows can't be placed, so a loop doesn't retry them forever.
 */
export async function importIntelligenceBatch(agentId: string, skip: string[] = []): Promise<ImportResult> {
  const [subs, done] = await Promise.all([
    rest<{ id: string }[]>('submissions?select=id&order=created_at.asc&limit=10000'),
    rest<{ submission_id: string }[]>('field_visits?submission_id=not.is.null&select=submission_id&limit=10000'),
  ]);
  const have = new Set([...done.map(d => d.submission_id), ...skip]);
  const todo = subs.map(s => s.id).filter(id => !have.has(id));
  const batchIds = todo.slice(0, BATCH);
  if (!batchIds.length) return { imported: 0, remaining: 0, unplaced: [] };

  const batch = await rest<Submission[]>(`submissions?id=in.(${batchIds.join(',')})&select=${SUBMISSION_COLUMNS}`);

  const pcFor = new Map<string, string>();
  for (const s of batch) {
    const m = `${s.location || ''} ${s.sites || ''}`.match(POSTCODE_RE);
    if (m) pcFor.set(s.id, normalisePostcode(m));
  }
  const pcPlaces = await postcodeLookup([...new Set(pcFor.values())]).catch(() => new Map<string, Place>());

  const rows: Record<string, unknown>[] = [];
  const unplaced: ImportResult['unplaced'] = [];
  for (const s of batch) {
    const name = (s.brand_trading_name || s.company || 'Unnamed venue').trim();
    const pc = pcFor.get(s.id);
    let place = pc ? pcPlaces.get(pc) || null : null;
    if (!place && (s.location || s.sites)) place = await townLookup(s.location || s.sites || '');
    if (!place) {
      unplaced.push({ id: s.id, name, location: s.location || s.sites || '' });
      continue;
    }
    const type = TYPE_MAP[s.venue_type || ''] || null;
    rows.push({
      agent_id: agentId,
      source: 'intelligence',
      submission_id: s.id,
      visited_at: s.created_at,
      venue_name: name,
      address: [s.location, s.sites].filter(Boolean).join(' · ').slice(0, 300) || null,
      postcode: place.postcode,
      lat: place.lat,
      lng: place.lng,
      geo_precision: place.precision,
      venue_type: type?.venue_type ?? null,
      ownership: type?.ownership ?? (s.site_count && s.site_count > 1 ? 'group' : null),
      group_name: s.site_count && s.site_count > 1 ? s.company : null,
      stack: cleanStack(s.stack),
      notes: s.site_count ? `From an Intelligence Review · ${s.site_count} site${s.site_count === 1 ? '' : 's'}` : 'From an Intelligence Review',
      contact_name: [s.first_name, s.last_name].filter(Boolean).join(' ') || null,
      contact_email: s.email?.toLowerCase() || null,
      contact_phone: s.phone_number,
      photos: [],
    });
  }

  if (rows.length) {
    await rest('field_visits?on_conflict=submission_id', {
      method: 'POST',
      // A second import running at the same time can't double up a review.
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
  }
  return { imported: rows.length, remaining: Math.max(0, todo.length - batchIds.length), unplaced };
}

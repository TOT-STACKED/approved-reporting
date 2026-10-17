// Bring Intelligence Reviews into Stacked Field as back-dated visits, so the
// team map shows every venue we already know about. One visit per submission
// (field_visits.submission_id is unique), so running it again only picks up
// reviews that arrived since. Chris's call, 17 Oct 2026: assign every
// historical review to one agent (Caz); new visits carry their own agent.
//
// Reviews have no coordinates, only free-text `location` and `sites`, so each
// is placed by, in order:
//   1 a UK postcode in either field (postcodes.io)
//   2 the venue itself, searched by name near its town (Photon / OpenStreetMap)
//   3 the town centre (postcodes.io places, then Photon for misspellings)
// Anything still unfound is imported anyway with no pin (geo_precision='none')
// and listed on the team map as "No location yet", so every review comes in.

import { rest } from './field-db';

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const BATCH = 15;

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

// Photon searches are limited to the UK so "Camden" can't land in New Jersey.
const UK_BBOX = '-8.7,49.8,1.9,60.9';
const PHOTON = 'https://photon.komoot.io/api';

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: { name?: string; postcode?: string; countrycode?: string } }

async function photon(q: string, tags: string[]): Promise<PhotonFeature | null> {
  const qs = new URLSearchParams({ q, limit: '1', lang: 'en', bbox: UK_BBOX });
  for (const t of tags) qs.append('osm_tag', t);
  const res = await fetch(`${PHOTON}?${qs}`, { headers: { 'User-Agent': 'StackedField/1.0 (partners.wearestacked.io)' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return null;
  const { features } = (await res.json().catch(() => ({}))) as { features?: PhotonFeature[] };
  return features?.[0] || null;
}

/** The venue itself, by name, if it's within 25 km of its town (or anywhere in the UK when there's no town). */
async function venueLookup(name: string, town: string, near: Place | null): Promise<Place | null> {
  if (!name || name.length < 3) return null;
  const f = await photon(town ? `${name} ${town}` : name, ['amenity', 'tourism:hotel', 'shop:bakery', 'shop:coffee']);
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates;
  if (near && km(near, { lat, lng }) > 25) return null;
  return { lat, lng, postcode: f.properties.postcode || null, precision: 'postcode' };
}

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
  const parts = text.split(/[,/;]|\band\b/i).map(s => s.trim()).filter(s => s.length > 2).slice(0, 3);
  for (const part of parts) {
    const res = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(part)}&limit=1`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res?.ok) continue;
    const { result } = (await res.json().catch(() => ({}))) as { result?: { latitude: number; longitude: number }[] | null };
    if (result?.[0]) return { lat: result[0].latitude, lng: result[0].longitude, postcode: null, precision: 'town' };
  }
  // Photon copes with misspellings ("Portabello", "Shepards bush") and areas ("Midlands").
  for (const part of parts) {
    const f = await photon(part, ['place', 'boundary']);
    if (f) return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], postcode: null, precision: 'town' };
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
  /** Imported, but with no pin yet. */
  unplaced: { id: string; name: string; location: string }[];
}

/** Import the next batch of reviews not yet brought in. Every review is imported, placed or not. */
export async function importIntelligenceBatch(agentId: string): Promise<ImportResult> {
  const [subs, done] = await Promise.all([
    rest<{ id: string }[]>('submissions?select=id&order=created_at.asc&limit=10000'),
    rest<{ submission_id: string }[]>('field_visits?submission_id=not.is.null&select=submission_id&limit=10000'),
  ]);
  const have = new Set(done.map(d => d.submission_id));
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

  const unplaced: ImportResult['unplaced'] = [];
  // Lookups for a batch run side by side to stay inside the function time limit.
  const rows = await Promise.all(batch.map(async s => {
    const name = (s.brand_trading_name || s.company || 'Unnamed venue').trim();
    const where = (s.location || '').trim();
    const pc = pcFor.get(s.id);
    let place = pc ? pcPlaces.get(pc) || null : null;
    if (!place) {
      const town = where ? await townLookup(where) : null;
      place = (await venueLookup(name, where, town).catch(() => null)) || town;
    }
    if (!place) unplaced.push({ id: s.id, name, location: where || s.sites || '' });
    const type = TYPE_MAP[s.venue_type || ''] || null;
    return {
      agent_id: agentId,
      source: 'intelligence',
      submission_id: s.id,
      visited_at: s.created_at,
      venue_name: name,
      address: [s.location, s.sites].filter(Boolean).join(' · ').slice(0, 300) || null,
      postcode: place?.postcode ?? null,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      geo_precision: place?.precision ?? 'none',
      venue_type: type?.venue_type ?? null,
      ownership: type?.ownership ?? (s.site_count && s.site_count > 1 ? 'group' : null),
      group_name: s.site_count && s.site_count > 1 ? s.company : null,
      stack: cleanStack(s.stack),
      notes: s.site_count ? `From an Intelligence Review · ${s.site_count} site${s.site_count === 1 ? '' : 's'}` : 'From an Intelligence Review',
      contact_name: [s.first_name, s.last_name].filter(Boolean).join(' ') || null,
      contact_email: s.email?.toLowerCase() || null,
      contact_phone: s.phone_number,
      photos: [],
    };
  }));

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

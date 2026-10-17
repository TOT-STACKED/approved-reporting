// Bring Intelligence Reviews into Stacked Field as back-dated visits, so the
// team map shows every venue we already know about. Chris's call, 17 Oct 2026:
// assign every historical review to one agent (Caz); new visits carry their
// own agent.
//
// Two sources, imported in this order:
//   1 `submissions` in kohnakdevwfudzgfjmab: the current review form, Renewals
//     and Field. One visit each, keyed by field_visits.submission_id.
//   2 `business_submissions` + `tech_stack_entries` in the StackCollect project
//     (STACKCOLLECT_SUPABASE_*): older reviews from before the current form.
//     Every current review is also copied there (techstackreview slack-notify),
//     so a row whose email + business name matches a submission is a copy and is
//     skipped. Keyed by field_visits.stackcollect_id (migration 008).
// Both keys are unique, so running it again only picks up what's new.
//
// Reviews have no coordinates, only free-text `location` and `sites`, so each
// is placed by, in order:
//   1 a UK postcode in either field (postcodes.io)
//   2 the venue itself, searched by name near its town (Photon / OpenStreetMap)
//   3 the town centre (postcodes.io places, then Photon for misspellings)
// Anything still unfound is imported anyway with no pin (geo_precision='none')
// and listed on the team map as "No location yet", so every review comes in.

import { allRows, countRows, rest } from './field-db';
import { isTestSubmission } from './stackcollect';
import { venueKey } from './field-shared';

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const BATCH = 8;

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

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; postcode?: string; countrycode?: string; osm_key?: string; osm_value?: string };
}

// Each batch has a time budget, well inside Netlify's 30 s limit. Lookups that
// would start after it return nothing, so the batch finishes: unplaced imports
// land in "No location yet" and the re-check fills them in later.
let deadline = Infinity;
let photonFailures = 0;
const outOfTime = () => Date.now() > deadline;
const timeLeft = (cap: number) => Math.max(500, Math.min(cap, deadline - Date.now()));

function startBudget(ms: number) {
  deadline = Date.now() + ms;
  photonFailures = 0;
}

// Photon is a free public service and answers 503 to bursts, so at most three
// requests are in flight per batch, with one retry when it's busy. After three
// failures in a batch it's left alone and the postcode/town lookups carry on.
let inFlight = 0;
const waiting: (() => void)[] = [];
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= 3) await new Promise<void>(r => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

async function photon(q: string, tags: string[] = []): Promise<PhotonFeature | null> {
  const qs = new URLSearchParams({ q, limit: '1', lang: 'en', bbox: UK_BBOX });
  for (const t of tags) qs.append('osm_tag', t);
  return throttled(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (outOfTime() || photonFailures >= 3) return null;
      const res = await fetch(`${PHOTON}?${qs}`, {
        headers: { 'User-Agent': 'StackedField/1.0 (partners.wearestacked.io)' },
        signal: AbortSignal.timeout(timeLeft(4000)),
      }).catch(() => null);
      if (!res || res.status === 503 || res.status === 429) {
        photonFailures++;
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      if (!res.ok) return null;
      const { features } = (await res.json().catch(() => ({}))) as { features?: PhotonFeature[] };
      return features?.[0] || null;
    }
    return null;
  });
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
    signal: AbortSignal.timeout(timeLeft(5000)),
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
    if (outOfTime()) return null;
    const res = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(part)}&limit=1`, { signal: AbortSignal.timeout(timeLeft(4000)) }).catch(() => null);
    if (!res?.ok) continue;
    const { result } = (await res.json().catch(() => ({}))) as { result?: { latitude: number; longitude: number }[] | null };
    if (result?.[0]) return { lat: result[0].latitude, lng: result[0].longitude, postcode: null, precision: 'town' };
  }
  // Photon copes with misspellings ("Portabello", "Shepards bush") and areas ("Midlands").
  for (const part of parts) {
    const f = await photon(part, ['place:city', 'place:town', 'place:suburb', 'place:quarter', 'place:neighbourhood', 'place:village', 'boundary:administrative']);
    if (f) return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], postcode: null, precision: 'town' };
  }
  return null;
}

// Big places: a pin on these is a town centre, so it stays marked approximate.
const BROAD = new Set(['city', 'town', 'village', 'hamlet', 'county', 'state', 'region', 'country', 'island', 'administrative']);

/**
 * The location text as a clue, as close as it goes: "Borough Market", "Portobello
 * Road" or "London O2" land on that landmark or street; "Camden" on the area.
 * Searched whole first (Photon, any kind of place in the UK), then piece by
 * piece as towns.
 */
async function clueLookup(text: string): Promise<Place | null> {
  const clue = text.trim();
  if (clue.length >= 3) {
    const f = await photon(clue);
    if (f && trustClue(clue, f)) {
      const p = f.properties;
      const broad = p.osm_key === 'place' ? BROAD.has(p.osm_value || '') : p.osm_key === 'boundary';
      return {
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        postcode: broad ? null : p.postcode || null,
        precision: broad ? 'town' : 'postcode',
      };
    }
  }
  return townLookup(clue);
}

// What a location clue may land on. Landmarks, stations, markets, parks and
// areas, yes. A single business or a farmyard that happens to share the name
// ("Portabello" the Nottingham restaurant), no. A street only when the clue
// names one ("Portobello Road"), since one-word clues match streets everywhere.
const TRUSTED_KEYS = new Set(['place', 'boundary', 'railway', 'tourism', 'leisure', 'historic', 'building', 'public_transport', 'aeroway']);
const TRUSTED_AMENITIES = new Set(['marketplace', 'theatre', 'arts_centre', 'events_venue', 'conference_centre', 'university', 'college', 'bus_station', 'ferry_terminal', 'townhall', 'library', 'cinema']);
const STREET_WORD = /\b(road|rd|street|st|lane|ln|avenue|ave|row|place|square|sq|hill|walk|way|terrace|gardens|parade|market|yard|mews|wharf|quay)\b/i;

function trustClue(clue: string, f: PhotonFeature): boolean {
  const { osm_key: key = '', osm_value: value = '' } = f.properties;
  if (key === 'place') return value !== 'hamlet' && value !== 'isolated_dwelling' && value !== 'farm';
  if (TRUSTED_KEYS.has(key)) return true;
  if (key === 'amenity') return TRUSTED_AMENITIES.has(value);
  if (key === 'highway') return STREET_WORD.test(clue);
  return false;
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

/** Place a review: postcode, else the venue by name near its clue, else the clue itself. */
async function placeFor(name: string, where: string, postcode: string | null, pcPlaces: Map<string, Place>): Promise<Place | null> {
  const byPostcode = postcode ? pcPlaces.get(postcode) || null : null;
  if (byPostcode) return byPostcode;
  const clue = where ? await clueLookup(where).catch(() => null) : null;
  return (await venueLookup(name, where, clue).catch(() => null)) || clue;
}

function postcodeIn(text: string): string | null {
  const m = text.match(POSTCODE_RE);
  return m ? normalisePostcode(m) : null;
}

export interface ImportResult {
  imported: number;
  remaining: number;
  /** Imported, but with no pin yet. */
  unplaced: { id: string; name: string; location: string }[];
}

async function insertVisits(rows: Record<string, unknown>[], key: 'submission_id' | 'stackcollect_id'): Promise<void> {
  if (!rows.length) return;
  await rest(`field_visits?on_conflict=${key}`, {
    method: 'POST',
    // A second import running at the same time can't double up a review.
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
}

// ── Source 1: submissions ───────────────────────────────────────────────────

async function pendingSubmissions(): Promise<string[]> {
  const [subs, done] = await Promise.all([
    allRows<{ id: string }>('submissions?select=id&order=created_at.asc,id.asc'),
    allRows<{ submission_id: string }>('field_visits?submission_id=not.is.null&select=submission_id&order=id.asc'),
  ]);
  const have = new Set(done.map(d => d.submission_id));
  return subs.map(s => s.id).filter(id => !have.has(id));
}

async function importSubmissions(agentId: string, ids: string[]): Promise<ImportResult['unplaced']> {
  const batch = await rest<Submission[]>(`submissions?id=in.(${ids.join(',')})&select=${SUBMISSION_COLUMNS}`);
  const pcFor = new Map<string, string>();
  for (const s of batch) {
    const pc = postcodeIn(`${s.location || ''} ${s.sites || ''}`);
    if (pc) pcFor.set(s.id, pc);
  }
  const pcPlaces = await postcodeLookup([...new Set(pcFor.values())]).catch(() => new Map<string, Place>());

  const unplaced: ImportResult['unplaced'] = [];
  // Lookups for a batch run side by side to stay inside the function time limit.
  const rows = await Promise.all(batch.map(async s => {
    const name = (s.brand_trading_name || s.company || 'Unnamed venue').trim();
    const where = (s.location || '').trim();
    const place = await placeFor(name, where, pcFor.get(s.id) || null, pcPlaces);
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
  await insertVisits(rows, 'submission_id');
  return unplaced;
}

// ── Source 2: StackCollect ──────────────────────────────────────────────────

const SC_URL = process.env.STACKCOLLECT_SUPABASE_URL;
const SC_KEY = process.env.STACKCOLLECT_SUPABASE_KEY;

async function sc<T>(path: string): Promise<T> {
  const res = await fetch(`${SC_URL}/rest/v1/${path}`, {
    headers: { apikey: SC_KEY!, Authorization: `Bearer ${SC_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`stackcollect ${res.status} on ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

async function scAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  while (out.length < 20000) {
    const page = await sc<T[]>(`${path}&limit=1000&offset=${out.length}`);
    if (!page.length) break;
    out.push(...page);
  }
  return out;
}

interface ScBusiness {
  id: string;
  created_at: string;
  business_name: string | null;
  brand_trading_name: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone_number: string | null;
  number_of_locations: string | null;
  size: string | null;
  vertical: string | null;
  site_count: number | null;
}

const SC_COLUMNS = 'id,created_at,business_name,brand_trading_name,location,contact_name,contact_email,phone_number,number_of_locations,size,vertical,site_count';

// StackCollect's category and vertical labels → our keys (the reverse of
// techstackreview slack-notify's CATEGORY_LABEL / VERTICAL_LABEL). Labels not
// listed are kept as they are, so nothing is lost.
const SC_CATEGORY: Record<string, string> = {
  'point of sale': 'pos', payments: 'payments', 'people management': 'workforce',
  'inventory & stock management': 'inventory', 'loyalty & crm': 'loyalty',
  'learning & development': 'learning', 'finance & accounting': 'finance_ops',
  'guest feedback': 'guest_feedback', reservations: 'reservations', 'bookings & reservations': 'reservations',
  'kitchen display': 'kds', 'kitchen display systems': 'kds', 'online ordering': 'ordering',
  'order & pay': 'ordering', 'order at table': 'ordering', kiosks: 'kiosk', 'self-service kiosks': 'kiosk',
};
const SC_VERTICAL: Record<string, string> = {
  'independent restaurant': 'indie', 'multi-site restaurant group': 'group', 'bar / pub': 'bar',
  'qsr / fast casual': 'qsr', 'hotel f&b': 'hotel', other: 'other',
};
const NA_TOOL = /^(n\/?a|none|null|n\.a\.?|—|-|other)$/i;

const dupKey = (email: string | null | undefined, name: string | null | undefined) =>
  `${(email || '').trim().toLowerCase()}|${(name || '').trim().toLowerCase()}`;

function scConfigured(): boolean {
  return Boolean(SC_URL && SC_KEY);
}

/** StackCollect reviews that are real, not a copy of a submission, and not imported yet. Oldest first. */
async function pendingStackCollect(): Promise<ScBusiness[]> {
  if (!scConfigured()) return [];
  const [all, subs, done] = await Promise.all([
    scAll<ScBusiness>(`business_submissions?select=${SC_COLUMNS}&order=created_at.asc,id.asc`),
    allRows<{ email: string | null; company: string | null; brand_trading_name: string | null }>('submissions?select=email,company,brand_trading_name&order=id.asc'),
    allRows<{ stackcollect_id: string }>('field_visits?stackcollect_id=not.is.null&select=stackcollect_id&order=id.asc'),
  ]);
  const copies = new Set<string>();
  for (const s of subs) {
    copies.add(dupKey(s.email, s.company));
    if (s.brand_trading_name) copies.add(dupKey(s.email, s.brand_trading_name));
  }
  const have = new Set(done.map(d => d.stackcollect_id));
  return all.filter(b =>
    !have.has(b.id) &&
    !isTestSubmission(b.business_name) &&
    (b.business_name || b.brand_trading_name) &&
    !copies.has(dupKey(b.contact_email, b.business_name)),
  );
}

function siteCountOf(b: ScBusiness): number | null {
  if (typeof b.site_count === 'number') return b.site_count;
  const m = (b.number_of_locations || b.size || '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function importStackCollect(agentId: string, batch: ScBusiness[]): Promise<ImportResult['unplaced']> {
  const entries = await sc<{ submission_id: string; category: string | null; tool_name: string | null }[]>(
    `tech_stack_entries?submission_id=in.(${batch.map(b => b.id).join(',')})&select=submission_id,category,tool_name&limit=5000`,
  );
  const stacks = new Map<string, Record<string, { tools: string[]; other: string; none: boolean }>>();
  for (const e of entries) {
    const tool = (e.tool_name || '').trim();
    if (!tool || NA_TOOL.test(tool) || !e.category) continue;
    const key = SC_CATEGORY[e.category.trim().toLowerCase()] || e.category.trim().slice(0, 60);
    const stack = stacks.get(e.submission_id) || {};
    const entry = stack[key] || { tools: [], other: '', none: false };
    if (!entry.tools.includes(tool)) entry.tools.push(tool);
    stack[key] = entry;
    stacks.set(e.submission_id, stack);
  }

  const pcFor = new Map<string, string>();
  for (const b of batch) {
    const pc = postcodeIn(b.location || '');
    if (pc) pcFor.set(b.id, pc);
  }
  const pcPlaces = await postcodeLookup([...new Set(pcFor.values())]).catch(() => new Map<string, Place>());

  const unplaced: ImportResult['unplaced'] = [];
  const rows = await Promise.all(batch.map(async b => {
    const name = (b.brand_trading_name || b.business_name || 'Unnamed venue').trim();
    const where = (b.location || '').trim();
    const place = await placeFor(name, where, pcFor.get(b.id) || null, pcPlaces);
    if (!place) unplaced.push({ id: b.id, name, location: where });
    const sites = siteCountOf(b);
    const type = TYPE_MAP[SC_VERTICAL[(b.vertical || '').trim().toLowerCase()] || ''] || null;
    return {
      agent_id: agentId,
      source: 'intelligence',
      stackcollect_id: b.id,
      visited_at: b.created_at,
      venue_name: name,
      address: where.slice(0, 300) || null,
      postcode: place?.postcode ?? null,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      geo_precision: place?.precision ?? 'none',
      venue_type: type?.venue_type ?? null,
      ownership: type?.ownership ?? (sites && sites > 1 ? 'group' : null),
      group_name: sites && sites > 1 ? b.business_name : null,
      stack: stacks.get(b.id) || {},
      notes: `From an earlier Intelligence Review (StackCollect)${sites ? ` · ${sites} site${sites === 1 ? '' : 's'}` : ''}`,
      contact_name: b.contact_name,
      contact_email: b.contact_email?.toLowerCase() || null,
      contact_phone: b.phone_number,
      photos: [],
    };
  }));
  await insertVisits(rows, 'stackcollect_id');
  return unplaced;
}

// ── Both ────────────────────────────────────────────────────────────────────

/** Import the next batch of reviews not yet brought in, current reviews first. Every review comes in, placed or not. */
export async function importIntelligenceBatch(agentId: string): Promise<ImportResult> {
  startBudget(17000);
  const subs = await pendingSubmissions();
  if (subs.length) {
    const ids = subs.slice(0, BATCH);
    const unplaced = await importSubmissions(agentId, ids);
    const scLeft = (await pendingStackCollect().catch(() => [])).length;
    return { imported: ids.length, remaining: subs.length - ids.length + scLeft, unplaced };
  }
  const older = await pendingStackCollect();
  if (!older.length) return { imported: 0, remaining: 0, unplaced: [] };
  const batch = older.slice(0, BATCH);
  const unplaced = await importStackCollect(agentId, batch);
  return { imported: batch.length, remaining: older.length - batch.length, unplaced };
}

export interface ImportStatus {
  reviews: number;
  imported: number;
  /** Imported, by source. */
  main: number;
  earlier: number;
  /** Distinct venues among imported reviews, and how many reviews are repeats of one. */
  venues: number;
  repeats: number;
}

/** How many reviews exist across both sources, how many are in, and how many are repeat visits to one venue. */
export async function importStatus(): Promise<ImportStatus> {
  const [subs, imported, scLeft] = await Promise.all([
    countRows('submissions'),
    allRows<{ venue_name: string; lat: number | null; lng: number | null; submission_id: string | null; stackcollect_id: string | null }>(
      'field_visits?source=eq.intelligence&select=venue_name,lat,lng,submission_id,stackcollect_id&order=id.asc',
    ),
    pendingStackCollect().then(r => r.length).catch(() => 0),
  ]);
  const main = imported.filter(v => v.submission_id).length;
  const earlier = imported.filter(v => v.stackcollect_id).length;
  const venues = new Set(imported.map(venueKey)).size;
  return { reviews: subs + earlier + scLeft, imported: main + earlier, main, earlier, venues, repeats: imported.length - venues };
}

// ── Re-check approximate pins ───────────────────────────────────────────────

const RANK = { none: 0, town: 1, postcode: 2, exact: 3 } as const;

/**
 * Run imported visits pinned to a town centre (or with no pin) back through
 * the lookup, and move any that now land closer. Works through them by id, a
 * batch at a time; pass back `after` to carry on.
 */
export async function recheckBatch(after = ''): Promise<{ checked: number; moved: number; last: string; done: boolean }> {
  startBudget(18000);
  const rows = await rest<{ id: string; venue_name: string; address: string | null; geo_precision: keyof typeof RANK }[]>(
    `field_visits?source=eq.intelligence&geo_precision=in.(town,none)${after ? `&id=gt.${after}` : ''}` +
    '&select=id,venue_name,address,geo_precision&order=id.asc&limit=8',
  );
  if (!rows.length) return { checked: 0, moved: 0, last: after, done: true };

  const results = await Promise.all(rows.map(async v => {
    // Imported addresses are "location · sites"; the clue is the first part.
    const where = (v.address || '').split(' · ')[0].trim();
    const pc = postcodeIn(where);
    const pcPlaces = pc ? await postcodeLookup([pc]).catch(() => new Map<string, Place>()) : new Map<string, Place>();
    const place = await placeFor(v.venue_name, where, pc, pcPlaces);
    if (!place || RANK[place.precision] <= RANK[v.geo_precision]) return false;
    await rest(`field_visits?id=eq.${v.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ lat: place.lat, lng: place.lng, postcode: place.postcode, geo_precision: place.precision, updated_at: new Date().toISOString() }),
    });
    return true;
  }));
  return { checked: rows.length, moved: results.filter(Boolean).length, last: rows[rows.length - 1].id, done: rows.length < 8 };
}

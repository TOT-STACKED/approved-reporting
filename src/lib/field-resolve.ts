// Finding a venue from what someone typed: a name, a name and an address, a
// postcode, or a line of notes like "The Crown, 12 High St, SE1 9AA".
//
// Sources, best first:
//   known   venues the team has visited or reviewed
//   target  brand targets (e.g. every Greene King pub), with full addresses
//   map     OpenStreetMap via Photon, nearest first
//   postcode the postcode's centre (postcodes.io), when one was typed
//   area    the street or town, as a last resort
// A postcode in the text narrows the first three to venues at that postcode.

import { allRows } from './field-db';
import { distanceM } from './field-shared';
import { placeFromClues } from './field-import';

export type PlaceSource = 'known' | 'target' | 'map' | 'postcode' | 'area';

export interface PlaceResult {
  name: string;
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  /** OpenStreetMap / visit ref when there is one. */
  ref: string | null;
  /** From the team's own data (known venue or target). */
  known: boolean;
  source: PlaceSource;
  /** A place where people eat, drink or stay (not a street, station or area). */
  venue?: boolean;
}

const VENUE_KEYS = new Set(['amenity', 'tourism', 'leisure', 'shop', 'craft']);

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const UA = 'StackedField/1.0 (partners.wearestacked.io)';

// Photon (the free OpenStreetMap search) refuses bursts with a 503, so its
// requests queue two at a time and retry briefly when it says it's busy.
let photonBusy = 0;
const photonQueue: (() => void)[] = [];
async function photonSearch(params: Record<string, string>): Promise<{ features?: unknown[] } | null> {
  if (photonBusy >= 2) await new Promise<void>(r => photonQueue.push(r));
  photonBusy++;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://photon.komoot.io/api?${new URLSearchParams(params)}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (res && (res.status === 503 || res.status === 429)) { await new Promise(r => setTimeout(r, 700 * (attempt + 1))); continue; }
      return res?.ok ? res.json() : null;
    }
    return null;
  } finally {
    photonBusy--;
    photonQueue.shift()?.();
  }
}

// Nominatim (OpenStreetMap's own search) is the backup when Photon is down or
// finds nothing that matches. Its rules: one request a second, a named app.
let nominatimChain: Promise<unknown> = Promise.resolve();
let nominatimLast = 0;
interface Nom { name?: string; lat: string; lon: string; osm_type?: string; osm_id?: number; category?: string; address?: Record<string, string> }
function nominatim(q: string, around?: { lat: number; lng: number }): Promise<Nom[]> {
  const run = nominatimChain.then(async () => {
    const wait = nominatimLast + 1100 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    nominatimLast = Date.now();
    const params: Record<string, string> = { q, format: 'jsonv2', countrycodes: 'gb', limit: '5', addressdetails: '1' };
    // Only within ~3 km of a point, when we know roughly where it is.
    if (around) Object.assign(params, { viewbox: `${around.lng - 0.045},${around.lat + 0.03},${around.lng + 0.045},${around.lat - 0.03}`, bounded: '1' });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB' }, signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    return res?.ok ? ((await res.json()) as Nom[]) : [];
  });
  nominatimChain = run.catch(() => {});
  return run.catch(() => []);
}

function fromNominatim(n: Nom): PlaceResult | null {
  if (!n.name) return null;
  const a = n.address || {};
  return {
    name: n.name,
    address: [[a.house_number, a.road].filter(Boolean).join(' '), a.suburb || a.city || a.town].filter(Boolean).join(', '),
    postcode: a.postcode || '',
    lat: Number(n.lat),
    lng: Number(n.lon),
    ref: n.osm_type && n.osm_id ? `${n.osm_type}/${n.osm_id}` : null,
    known: false,
    source: 'map',
    venue: VENUE_KEYS.has(n.category || ''),
  };
}

// Google Places (New) Text Search: best UK venue coverage, used first when a
// server key is set (GOOGLE_PLACES_SERVER_KEY, Places API (New) only). Paid
// per search, so only the fields we use are requested.
const GOOGLE_KEY = process.env.GOOGLE_PLACES_SERVER_KEY;
const GOOGLE_VENUE = /restaurant|bar|pub|cafe|coffee|food|meal|bakery|night_club|lodging|hotel|brewery|wine|cocktail|store|deli|diner|steak|pizza/;

interface GPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  postalAddress?: { postalCode?: string; addressLines?: string[]; locality?: string };
}

async function googleText(q: string, near: { lat: number; lng: number }): Promise<PlaceResult[] | null> {
  if (!GOOGLE_KEY) return null;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.postalAddress',
    },
    body: JSON.stringify({
      textQuery: q,
      regionCode: 'GB',
      maxResultCount: 8,
      locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } },
    }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const { places = [] } = (await res.json().catch(() => ({}))) as { places?: GPlace[] };
  return places.flatMap(p => {
    if (!p.displayName?.text || !p.location) return [];
    const postcode = p.postalAddress?.postalCode || '';
    const address = (p.formattedAddress || '').replace(/,\s*(UK|United Kingdom)$/i, '').replace(postcode, '').replace(/\s+,|,\s*$/g, '').trim();
    return [{
      name: p.displayName.text,
      address,
      postcode,
      lat: p.location.latitude,
      lng: p.location.longitude,
      ref: `google/${p.id}`,
      known: false,
      source: 'map' as const,
      venue: (p.types || []).some(t => GOOGLE_VENUE.test(t)),
    }];
  });
}

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const pcNorm = (s: string | null | undefined) => (s || '').toUpperCase().replace(/\s+/g, '');

const STOP = new Set(['the', 'and', 'a', 'of', 'at', 'on', 'in', 'ye', 'olde']);
const words = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));

/**
 * Same venue name, give or take: every word of the shorter name appears in
 * the longer ("Flat Iron" ~ "Flat Iron Covent Garden", "Crown & Anchor" ~
 * "The Crown and Anchor"). A single short word ("Ship") must match the whole
 * other name, so a street called "Ship and Mermaid Row" doesn't count.
 */
export function looselySame(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  if (norm(a) === norm(b)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === 1 && short[0].length < 6) return long.length === 1 && long[0] === short[0];
  return short.every(w => long.includes(w));
}

/** "The Crown, 12 High St, SE1 9AA" → name "The Crown", rest "12 High St", postcode "SE1 9AA". */
export function splitLine(text: string): { name: string; rest: string; postcode: string } {
  const m = text.match(POSTCODE);
  const postcode = m ? `${m[1]} ${m[2]}`.toUpperCase() : '';
  const clean = (m ? text.replace(m[0], ' ') : text)
    .replace(/^[\s\-•*·\d.)]+/, '') // bullets and numbering
    .replace(/\s+/g, ' ')
    .trim();
  const [name, ...rest] = clean.split(/\s*[,|–—]\s*|\s+-\s+/);
  return { name: (name || '').trim(), rest: rest.join(', ').replace(/[,\s]+$/, '').trim(), postcode };
}

const ilike = (s: string) => encodeURIComponent(`*${s.replace(/[*,()]/g, ' ').trim()}*`);

/**
 * Everything that might be the venue, best first. `deep` (for resolving a line
 * rather than a quick search as you type) also asks Nominatim when Photon
 * finds no matching name.
 */
export async function searchPlaces(q: string, near: { lat: number; lng: number }, deep = false): Promise<PlaceResult[]> {
  const { name, rest, postcode } = splitLine(q);
  const nameQ = name.length >= 2 ? name : '';

  const [google, known, targets, photon, pcPoint] = await Promise.all([
    googleText([name, rest, postcode].filter(Boolean).join(', ') || q, near).catch(() => null),
    nameQ ? allRows<{ id: string; venue_name: string; address: string | null; postcode: string | null; lat: number | null; lng: number | null; osm_ref: string | null }>(
      `field_visits?venue_name=ilike.${ilike(nameQ)}&lat=not.is.null&select=id,venue_name,address,postcode,lat,lng,osm_ref&order=visited_at.desc`, 200,
    ).catch(() => []) : Promise.resolve([]),
    nameQ ? allRows<{ name: string; address: string | null; postcode: string | null; lat: number; lng: number }>(
      `field_targets?name=ilike.${ilike(nameQ)}&select=name,address,postcode,lat,lng`, 300,
    ).catch(() => []) : Promise.resolve([]),
    photonSearch({ q: [name, rest, postcode].filter(Boolean).join(' ') || q, limit: '8', lang: 'en', lat: String(near.lat), lon: String(near.lng), bbox: '-8.7,49.8,1.9,60.9' }).catch(() => ({ features: [] })),
    postcode ? fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, { signal: AbortSignal.timeout(5000) })
      .then(r => (r.ok ? r.json() : null)).then(j => (j?.result ? { lat: j.result.latitude as number, lng: j.result.longitude as number } : null)).catch(() => null)
      : Promise.resolve(null),
  ]);

  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  const push = (r: PlaceResult) => {
    const k = `${norm(r.name)}|${r.lat.toFixed(3)},${r.lng.toFixed(3)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };
  // With a postcode, venues at that postcode first; without, nearest first.
  const rank = <T extends { postcode?: string | null; lat: number; lng: number }>(rows: T[]) =>
    [...rows].sort((a, b) =>
      (postcode ? Number(pcNorm(b.postcode) === pcNorm(postcode)) - Number(pcNorm(a.postcode) === pcNorm(postcode)) : 0)
      || distanceM(near.lat, near.lng, a.lat, a.lng) - distanceM(near.lat, near.lng, b.lat, b.lng));

  for (const v of rank(known.filter(v => v.lat != null && v.lng != null) as (typeof known[number] & { lat: number; lng: number })[]).slice(0, 6)) {
    push({ name: v.venue_name, address: v.address || '', postcode: v.postcode || '', lat: v.lat, lng: v.lng, ref: v.osm_ref || `visit/${v.id}`, known: true, source: 'known' });
  }
  for (const t of rank(targets).slice(0, 6)) {
    push({ name: t.name, address: t.address || '', postcode: t.postcode || '', lat: t.lat, lng: t.lng, ref: null, known: true, source: 'target' });
  }
  for (const g of google || []) push(g);
  type F = { geometry: { coordinates: [number, number] }; properties: { osm_type?: string; osm_id?: number; osm_key?: string; name?: string; housenumber?: string; street?: string; city?: string; district?: string; postcode?: string } };
  const types: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
  for (const f of ((photon as { features?: F[] } | null)?.features || [])) {
    const p = f.properties;
    if (!p.name) continue;
    const [lng, lat] = f.geometry.coordinates;
    push({
      name: p.name,
      address: [[p.housenumber, p.street].filter(Boolean).join(' '), p.district || p.city].filter(Boolean).join(', '),
      postcode: p.postcode || '',
      lat, lng,
      ref: p.osm_type && p.osm_id ? `${types[p.osm_type]}/${p.osm_id}` : null,
      known: false,
      source: 'map',
      venue: VENUE_KEYS.has(p.osm_key || ''),
    });
  }
  const photonMatched = out.some(r => r.source === 'map' && r.venue && looselySame(r.name, name));
  // Nominatim is only the backup: skip it when Google answered.
  if (google === null && (photon === null || (deep && !photonMatched && !out.some(r => r.known && looselySame(r.name, name))))) {
    for (const n of await nominatim([name, rest, postcode].filter(Boolean).join(', ') || q)) {
      const r = fromNominatim(n);
      if (r) push(r);
    }
  }
  if (pcPoint) push({ name: name || postcode, address: rest, postcode, lat: pcPoint.lat, lng: pcPoint.lng, ref: null, known: false, source: 'postcode' });
  return out.slice(0, 20);
}

/** A rough point for an area typed after a name: an outcode ("SE1") or a street / town. */
async function areaPoint(text: string): Promise<{ lat: number; lng: number } | null> {
  const t = text.trim();
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/i.test(t)) {
    const res = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    const j = res?.ok ? await res.json().catch(() => null) : null;
    return j?.result ? { lat: j.result.latitude, lng: j.result.longitude } : null;
  }
  const p = await placeFromClues(t, t, '').catch(() => null);
  return p ? { lat: p.lat, lng: p.lng } : null;
}

/**
 * The one best place for a line of text, or null. Trusts a known venue,
 * target or map result only when its name matches what was typed; otherwise
 * falls back to the postcode, then the street or town.
 */
/**
 * A line resolved: the confident match, or null with the closest candidates
 * (venues first, near where the line says) for the agent to pick from.
 */
export async function resolveWithSuggestions(line: string, near: { lat: number; lng: number }): Promise<{ place: PlaceResult | null; suggestions: PlaceResult[] }> {
  const place = await resolveLine(line, near);
  if (place && place.source !== 'postcode' && place.source !== 'area') return { place, suggestions: [] };
  const { name } = splitLine(line);
  const results = await searchPlaces(line, near).catch(() => []);
  const suggestions = results
    .filter(r => r.source !== 'postcode' && (r.known || r.venue))
    .sort((a, b) => Number(looselySame(b.name, name)) - Number(looselySame(a.name, name)))
    .slice(0, 4);
  return { place, suggestions };
}

export async function resolveLine(line: string, near: { lat: number; lng: number }): Promise<PlaceResult | null> {
  const { name, rest, postcode } = splitLine(line);
  if (!name && !postcode) return null;
  const results = await searchPlaces(line, near, true);
  const pcPoint = results.find(x => x.source === 'postcode');
  // Where the line says it is: the postcode, else the area or street typed
  // after the name ("The Ship, SE1"). A same-named pub in Kent doesn't count.
  const anchor = pcPoint || (rest ? await areaPoint(rest) : null);
  // "SE1": a match's own postcode must be in SE1 (when it has one).
  const outcode = /^[A-Z]{1,2}\d[A-Z\d]?$/i.test(rest) ? rest.toUpperCase() : '';
  const inOutcode = (r: PlaceResult) => !outcode || !r.postcode || r.postcode.toUpperCase().startsWith(`${outcode} `);
  const named = results
    .filter(r => r.source !== 'postcode' && (r.known || r.venue) && looselySame(r.name, name))
    .filter(r => !postcode || !r.postcode || pcNorm(r.postcode) === pcNorm(postcode) || (pcPoint && distanceM(r.lat, r.lng, pcPoint.lat, pcPoint.lng) < 1500))
    .filter(r => !anchor || distanceM(r.lat, r.lng, anchor.lat, anchor.lng) < 6000)
    .filter(inOutcode)
    .sort((a, b) => {
      const from = anchor || near;
      return Number(b.known) - Number(a.known) || distanceM(from.lat, from.lng, a.lat, a.lng) - distanceM(from.lat, from.lng, b.lat, b.lng);
    })[0];
  if (named) return named;
  // Known area, no match yet: look for the name only around that area
  // (Nominatim, one a second, so only when Google isn't doing the work).
  if (anchor && !GOOGLE_KEY) {
    const local = (await nominatim(outcode ? `${name}, ${outcode}` : name, anchor)).map(fromNominatim)
      .filter((r): r is PlaceResult => Boolean(r && r.venue && looselySame(r.name, name) && inOutcode(r)));
    if (local[0]) return local[0];
  }
  const pc = results.find(r => r.source === 'postcode');
  if (pc) return pc;
  if (anchor) return { name, address: rest, postcode: '', lat: anchor.lat, lng: anchor.lng, ref: null, known: false, source: 'area' };
  // "Dishoom Shoreditch", "Flat Iron Covent Garden": the area tacked on the
  // end. Try the last word or two as the area, and the rest as the venue near it.
  const words = name.split(/\s+/);
  if (!rest && words.length >= 2 && !GOOGLE_KEY) {
    for (const cut of [1, 2]) {
      if (words.length - cut < 1) break;
      const venue = words.slice(0, -cut).join(' ');
      const area = words.slice(-cut).join(' ');
      const at = await placeFromClues(area, area, '').catch(() => null);
      if (!at) continue;
      const near2 = await searchPlaces(`${venue}, ${area}`, at, true).catch(() => []);
      const hit = near2.find(r => r.source !== 'postcode' && (r.known || r.venue) && looselySame(r.name, venue) && distanceM(r.lat, r.lng, at.lat, at.lng) < 3000);
      if (hit) return hit;
    }
  }
  if (rest) {
    const area = await placeFromClues(name, rest, '').catch(() => null);
    if (area) return { name, address: rest, postcode: area.postcode || '', lat: area.lat, lng: area.lng, ref: null, known: false, source: 'area' };
  }
  return null;
}

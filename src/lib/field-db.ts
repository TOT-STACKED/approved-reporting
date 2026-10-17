// Data access for Stacked Field. Supabase project kohnakdevwfudzgfjmab, beside
// `submissions`, using the marketplace's service-role env vars. Both tables
// have RLS on with no policies, so nothing but this server can touch them.
//
// Agents only ever see and change their own visits; the agent id always comes
// from the signed-in session, never from the browser. Managers see everything.

import { bootstrapManagers, fieldSessionEmail } from './field-auth';
import {
  BUSYNESS,
  COVER_BANDS,
  DEMO_INTEREST,
  FIELD_VENUE_TYPES,
  OWNERSHIP,
  distanceM,
  isStackKey,
  type FieldAgent,
  type FieldStack,
  type FieldVisit,
  type NearbyPlace,
} from './field-shared';

const URL_ = process.env.VENUES_SUPABASE_URL;
const KEY = process.env.VENUES_SUPABASE_KEY;
const BUCKET = 'field-photos';

export function fieldConfigured(): boolean {
  return Boolean(URL_ && KEY);
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (!URL_ || !KEY) throw new Error('VENUES_SUPABASE_URL / VENUES_SUPABASE_KEY not set');
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}

export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: headers((init.headers as Record<string, string>) || {}),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase ${res.status} on ${path.split('?')[0]}: ${detail.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;

// ── Agents ───────────────────────────────────────────────────────────────────

const AGENT_COLUMNS = 'id,email,name,role,active,last_sign_in_at';

export async function findAgent(email: string): Promise<FieldAgent | null> {
  const rows = await rest<FieldAgent[]>(`field_agents?email=eq.${enc(email.toLowerCase())}&select=${AGENT_COLUMNS}&limit=1`);
  return rows[0] || null;
}

/**
 * The agent row for an email that may sign in, or null. Bootstrap managers
 * (FIELD_MANAGERS) get a row created on first sign-in. Deactivated agents
 * can't sign in.
 */
export async function agentForSignIn(email: string): Promise<FieldAgent | null> {
  const existing = await findAgent(email);
  if (existing) return existing.active ? existing : null;
  if (!bootstrapManagers().includes(email.toLowerCase())) return null;
  const [row] = await rest<FieldAgent[]>(`field_agents?select=${AGENT_COLUMNS}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ email: email.toLowerCase(), role: 'manager' }),
  });
  return row;
}

/** The signed-in agent, if they're still active. */
export async function currentAgent(): Promise<FieldAgent | null> {
  if (!fieldConfigured()) return null;
  const email = await fieldSessionEmail();
  if (!email) return null;
  const agent = await findAgent(email);
  return agent?.active ? agent : null;
}

export async function touchSignIn(id: string): Promise<void> {
  await rest(`field_agents?id=eq.${enc(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_sign_in_at: new Date().toISOString() }),
  });
}

export async function listAgents(): Promise<FieldAgent[]> {
  return rest<FieldAgent[]>(`field_agents?select=${AGENT_COLUMNS}&order=created_at.asc`);
}

export class AgentInputError extends Error {}

export async function addAgent(email: string, name: string, role: 'agent' | 'manager'): Promise<FieldAgent> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new AgentInputError('Enter a valid email');
  const existing = await findAgent(clean);
  if (existing) {
    // Re-adding someone who was removed switches them back on.
    const [row] = await rest<FieldAgent[]>(`field_agents?id=eq.${enc(existing.id)}&select=${AGENT_COLUMNS}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ active: true, name: name || existing.name, role }),
    });
    return row;
  }
  const [row] = await rest<FieldAgent[]>(`field_agents?select=${AGENT_COLUMNS}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ email: clean, name: name || null, role }),
  });
  return row;
}

/** Agents are switched off, not deleted, so their visits keep a name. */
export async function updateAgent(id: string, fields: { active?: boolean; role?: 'agent' | 'manager'; name?: string }): Promise<void> {
  const body: Record<string, unknown> = {};
  if (typeof fields.active === 'boolean') body.active = fields.active;
  if (fields.role === 'agent' || fields.role === 'manager') body.role = fields.role;
  if (typeof fields.name === 'string') body.name = fields.name.trim().slice(0, 100) || null;
  if (!Object.keys(body).length) return;
  await rest(`field_agents?id=eq.${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// ── Visits ───────────────────────────────────────────────────────────────────

const VISIT_COLUMNS = [
  'id', 'visited_at', 'agent_id', 'source', 'submission_id', 'venue_name', 'address', 'postcode', 'osm_ref', 'lat', 'lng', 'geo_precision',
  'gps_lat', 'gps_lng', 'gps_accuracy_m', 'venue_type', 'covers', 'ownership', 'group_name', 'busyness',
  'stack', 'notes', 'contact_name', 'contact_role', 'contact_email', 'contact_phone', 'demo_interest', 'photos',
].join(',');

type VisitRow = Omit<FieldVisit, 'agent_name'> & { field_agents?: { name: string | null; email: string } | null };

function toVisit(r: VisitRow): FieldVisit {
  const { field_agents, ...rest_ } = r;
  return {
    ...rest_,
    stack: (r.stack || {}) as FieldStack,
    photos: r.photos || [],
    agent_name: field_agents ? field_agents.name || field_agents.email : null,
  };
}

export interface VisitFilter {
  agentId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listVisits(f: VisitFilter = {}): Promise<FieldVisit[]> {
  const q = [`select=${VISIT_COLUMNS},field_agents(name,email)`, 'order=visited_at.desc', `limit=${Math.min(f.limit || 2000, 5000)}`];
  if (f.agentId) q.push(`agent_id=eq.${enc(f.agentId)}`);
  if (f.from) q.push(`visited_at=gte.${enc(f.from)}`);
  if (f.to) q.push(`visited_at=lt.${enc(f.to)}`);
  const rows = await rest<VisitRow[]>(`field_visits?${q.join('&')}`);
  return rows.map(toVisit);
}

export async function getVisit(id: string): Promise<FieldVisit | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = await rest<VisitRow[]>(`field_visits?id=eq.${enc(id)}&select=${VISIT_COLUMNS},field_agents(name,email)&limit=1`);
  return rows[0] ? toVisit(rows[0]) : null;
}

/** Earlier visits to the same place, so an agent knows they've been before. */
export async function visitsToPlace(osmRef: string): Promise<{ id: string; visited_at: string }[]> {
  return rest(`field_visits?osm_ref=eq.${enc(osmRef)}&select=id,visited_at&order=visited_at.desc&limit=5`);
}

/** The latest visit to each of these places, by place ref. */
export async function lastVisits(refs: string[]): Promise<Record<string, string>> {
  const clean = refs.filter(r => /^((node|way|relation)\/\d+|google\/[A-Za-z0-9_-]{10,300})$/.test(r)).slice(0, 40);
  if (!clean.length) return {};
  const rows = await rest<{ osm_ref: string; visited_at: string }[]>(
    `field_visits?osm_ref=in.(${clean.map(r => `"${r}"`).map(enc).join(',')})&select=osm_ref,visited_at&order=visited_at.desc&limit=500`,
  );
  const out: Record<string, string> = {};
  for (const r of rows) if (!out[r.osm_ref]) out[r.osm_ref] = r.visited_at;
  return out;
}

export class VisitInputError extends Error {}

const oneOf = <T extends readonly { id: string }[]>(list: T, v: unknown) =>
  typeof v === 'string' && list.some(x => x.id === v) ? v : null;

/** Validate and normalise what the phone sent. Unknown keys are dropped. */
export function cleanVisitInput(input: Record<string, unknown>, agentId: string): Record<string, unknown> {
  const text = (v: unknown, max = 200) => {
    if (v == null) return null;
    const s = String(v).trim().slice(0, max);
    return s || null;
  };
  const num = (v: unknown, min: number, max: number) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  const venue_name = text(input.venue_name);
  if (!venue_name) throw new VisitInputError('Give the venue a name');
  const lat = num(input.lat, -90, 90);
  const lng = num(input.lng, -180, 180);
  if (lat == null || lng == null) throw new VisitInputError('Tag the venue on the map');

  const stack: FieldStack = {};
  const rawStack = (input.stack && typeof input.stack === 'object' ? input.stack : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawStack)) {
    if (!isStackKey(key) || !value || typeof value !== 'object') continue;
    const e = value as Record<string, unknown>;
    const tools = Array.isArray(e.tools) ? e.tools.map(t => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 10) : [];
    const other = text(e.other, 120) || '';
    const none = Boolean(e.none) && !tools.length && !other;
    if (tools.length || other || none) stack[key] = { tools, other, none };
  }

  const photos = Array.isArray(input.photos)
    ? input.photos.filter(p => ownsPhotoPath(agentId, p)).slice(0, 12) as string[]
    : [];

  const visitedAt = typeof input.visited_at === 'string' && !Number.isNaN(Date.parse(input.visited_at))
    ? new Date(Math.min(Date.parse(input.visited_at), Date.now())).toISOString()
    : new Date().toISOString();

  const osmRef = typeof input.osm_ref === 'string' && /^((node|way|relation)\/\d+|google\/[A-Za-z0-9_-]{10,300})$/.test(input.osm_ref) ? input.osm_ref : null;
  const accuracy = num(input.gps_accuracy_m, 0, 100000);

  return {
    venue_name,
    address: text(input.address, 300),
    postcode: text(input.postcode, 12)?.toUpperCase() ?? null,
    osm_ref: osmRef,
    lat,
    lng,
    geo_precision: input.geo_precision === 'postcode' || input.geo_precision === 'town' ? input.geo_precision : 'exact',
    gps_lat: num(input.gps_lat, -90, 90),
    gps_lng: num(input.gps_lng, -180, 180),
    gps_accuracy_m: accuracy == null ? null : Math.round(accuracy),
    visited_at: visitedAt,
    venue_type: oneOf(FIELD_VENUE_TYPES, input.venue_type),
    covers: (COVER_BANDS as readonly string[]).includes(String(input.covers)) ? String(input.covers) : null,
    ownership: oneOf(OWNERSHIP, input.ownership),
    group_name: text(input.group_name, 120),
    busyness: oneOf(BUSYNESS, input.busyness),
    stack,
    notes: text(input.notes, 4000),
    contact_name: text(input.contact_name, 120),
    contact_role: text(input.contact_role, 120),
    contact_email: text(input.contact_email, 200)?.toLowerCase() ?? null,
    contact_phone: text(input.contact_phone, 40),
    demo_interest: oneOf(DEMO_INTEREST, input.demo_interest),
    photos,
  };
}

export async function createVisit(agentId: string, fields: Record<string, unknown>): Promise<string> {
  const [row] = await rest<{ id: string }[]>('field_visits?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...fields, agent_id: agentId }),
  });
  return row.id;
}

export async function updateVisit(id: string, fields: Record<string, unknown>): Promise<void> {
  await rest(`field_visits?id=eq.${enc(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

export async function deleteVisit(id: string): Promise<void> {
  const visit = await getVisit(id);
  if (!visit) return;
  if (visit.photos.length) await removePhotos(visit.photos).catch(() => {});
  await rest(`field_visits?id=eq.${enc(id)}`, { method: 'DELETE' });
}

/** May this agent see or change this visit? Managers can touch any. */
export function canAccess(agent: FieldAgent, visit: FieldVisit): boolean {
  return agent.role === 'manager' || visit.agent_id === agent.id;
}

// ── Photos ───────────────────────────────────────────────────────────────────

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function photoExtension(type: string): string | null {
  return PHOTO_TYPES[type] || null;
}

export async function uploadPhoto(agentId: string, bytes: Buffer, type: string): Promise<string> {
  const ext = photoExtension(type);
  if (!ext) throw new VisitInputError('Photos must be JPEG, PNG or WebP');
  // Path is ours, never the uploaded filename, so nothing from the browser lands in it.
  const path = `${agentId}/${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': type },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return path;
}

/** Only accept a photo path the server issued to this agent. */
export function ownsPhotoPath(agentId: string, path: unknown): path is string {
  return typeof path === 'string' && new RegExp(`^${agentId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path);
}

async function removePhotos(paths: string[]): Promise<void> {
  await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ prefixes: paths }),
  });
}

/** Hour-long links to a visit's photos, in order. */
export async function photoLinks(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const res = await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ expiresIn: 3600, paths }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as { signedURL?: string | null }[];
  return rows.map(r => (r.signedURL ? `${URL_}/storage/v1${r.signedURL}` : '')).filter(Boolean);
}

// ── Nearby places (OpenStreetMap) ────────────────────────────────────────────

const OVERPASS = process.env.FIELD_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const AMENITIES = 'restaurant|cafe|bar|pub|fast_food|nightclub|food_court|biergarten|ice_cream';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const UA = 'StackedField/1.0 (partners.wearestacked.io)';
const PHOTON_TAGS = ['amenity:restaurant', 'amenity:cafe', 'amenity:bar', 'amenity:pub', 'amenity:fast_food',
  'amenity:nightclub', 'amenity:food_court', 'amenity:biergarten', 'amenity:ice_cream', 'tourism:hotel'];

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: 'N' | 'W' | 'R'; osm_id?: number; osm_value?: string; name?: string;
    housenumber?: string; street?: string; city?: string; district?: string; postcode?: string;
  };
}

/** Photon (Komoot's OpenStreetMap search): fast, and returns addresses and postcodes. */
async function photonNearby(lat: number, lng: number, r: number): Promise<NearbyPlace[]> {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lng), radius: String(r / 1000), limit: '40', lang: 'en' });
  for (const t of PHOTON_TAGS) qs.append('osm_tag', t);
  const res = await fetch(`https://photon.komoot.io/reverse?${qs}`, { headers: { 'User-Agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const { features = [] } = (await res.json()) as { features?: PhotonFeature[] };
  const types = { N: 'node', W: 'way', R: 'relation' } as const;
  return features
    .filter(f => f.properties.name && f.properties.osm_type && f.properties.osm_id)
    .map(f => {
      const p = f.properties;
      const [pLng, pLat] = f.geometry.coordinates;
      return {
        ref: `${types[p.osm_type!]}/${p.osm_id}`,
        name: p.name!,
        lat: pLat,
        lng: pLng,
        kind: p.osm_value || '',
        address: [[p.housenumber, p.street].filter(Boolean).join(' '), p.district || p.city].filter(Boolean).join(', '),
        postcode: p.postcode || '',
        distance_m: distanceM(lat, lng, pLat, pLng),
      };
    });
}

/** The OpenStreetMap Overpass API, as a backup: complete but often slow or down. */
async function overpassNearby(lat: number, lng: number, r: number): Promise<NearbyPlace[]> {
  const query = `[out:json][timeout:8];
(
  nwr(around:${r},${lat},${lng})["amenity"~"^(${AMENITIES})$"]["name"];
  nwr(around:${r},${lat},${lng})["tourism"="hotel"]["name"];
);
out center tags 60;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const { elements = [] } = (await res.json()) as { elements?: OverpassElement[] };

  const places: NearbyPlace[] = [];
  for (const el of elements) {
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    const t = el.tags || {};
    if (pLat == null || pLng == null || !t.name) continue;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    places.push({
      ref: `${el.type}/${el.id}`,
      name: t.name,
      lat: pLat,
      lng: pLng,
      kind: t.amenity || t.tourism || '',
      address: [street, t['addr:city']].filter(Boolean).join(', '),
      postcode: t['addr:postcode'] || '',
      distance_m: distanceM(lat, lng, pLat, pLng),
    });
  }
  return places;
}

/**
 * Hospitality venues within `radius` metres, nearest first, from OpenStreetMap.
 * Photon first (fast); Overpass if Photon fails. Coverage of UK high streets
 * is good but not perfect, which is why the app always lets the agent drop
 * their own pin. With a Google key the phone uses Google Places instead.
 */
export async function nearbyPlaces(lat: number, lng: number, radius = 150): Promise<NearbyPlace[]> {
  const r = Math.max(30, Math.min(radius, 500));
  let places: NearbyPlace[];
  try {
    places = await photonNearby(lat, lng, r);
  } catch {
    places = await overpassNearby(lat, lng, r);
  }
  return places.filter(p => p.distance_m <= r * 1.2).sort((a, b) => a.distance_m - b.distance_m).slice(0, 40);
}

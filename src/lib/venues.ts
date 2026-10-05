// Venue data for the marketplace, from the Tech stack review submissions
// (Supabase project kohnakdevwfudzgfjmab, not the Lovable StackCollect one).
//
// Two rules hold everything here:
//
//   1. Contact details never leave this file. The query names its columns, and
//      email, phone and personal names are not among them — so they are never
//      even fetched, let alone serialised to a browser.
//   2. Every venue the viewer hasn't revealed is anonymised on the server.
//      A locked card carries no name and no tool names; there is nothing to
//      read out of devtools that the viewer hasn't paid for.
//
// Only reviews with consent = true are listed. Each brand appears once, from
// its most recent review.

import {
  CATEGORIES,
  UNHAPPY_MAX,
  type Category,
} from './venue-plans';
import type { Entitlement } from './venue-subscribers';
import { categoriesFor } from './venue-subscribers';

const URL_ = process.env.VENUES_SUPABASE_URL;
const KEY = process.env.VENUES_SUPABASE_KEY;

const COLUMNS = [
  'id',
  'created_at',
  'venue_type',
  'sites',
  'site_count',
  'location',
  'brand_trading_name',
  'company',
  'stack',
  'gap_categories',
].join(',');

interface StackEntry {
  tools?: string[];
  other?: string;
  none?: boolean;
  nps?: Record<string, number>;
}

interface Row {
  id: string;
  created_at: string;
  venue_type: string | null;
  sites: string | null;
  site_count: number | null;
  location: string | null;
  brand_trading_name: string | null;
  company: string | null;
  stack: Record<string, StackEntry> | null;
  gap_categories: string[] | null;
}

export interface Tool {
  name: string;
  score: number | null;
}

interface Venue {
  id: string;
  name: string;
  reviewedAt: string;
  venueType: string;
  sites: string;
  location: string;
  stack: Partial<Record<Category, Tool[]>>;
  gaps: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: Venue[] | null = null;
let cachedAt = 0;

export function venuesConfigured(): boolean {
  return Boolean(URL_ && KEY);
}

function toolsFor(entry: StackEntry | undefined): Tool[] {
  if (!entry || entry.none) return [];
  const nps = entry.nps || {};
  const out: Tool[] = (entry.tools || []).map(name => ({
    name,
    score: typeof nps[name] === 'number' ? nps[name] : null,
  }));
  const other = (entry.other || '').trim();
  if (other) {
    const score = nps[`__other__:${other}`];
    out.push({ name: other, score: typeof score === 'number' ? score : null });
  }
  return out;
}

function toVenue(r: Row): Venue {
  const stack: Partial<Record<Category, Tool[]>> = {};
  for (const c of CATEGORIES) {
    const tools = toolsFor(r.stack?.[c]);
    if (tools.length) stack[c] = tools;
  }
  return {
    id: r.id,
    name: (r.brand_trading_name || r.company || '').trim(),
    reviewedAt: r.created_at,
    venueType: r.venue_type || 'other',
    sites: r.sites || (r.site_count ? String(r.site_count) : ''),
    location: (r.location || '').trim(),
    stack,
    gaps: r.gap_categories || [],
  };
}

async function load(): Promise<Venue[]> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  if (!venuesConfigured()) throw new Error('VENUES_SUPABASE_URL / VENUES_SUPABASE_KEY not configured');

  const res = await fetch(
    `${URL_}/rest/v1/submissions?select=${COLUMNS}&consent=eq.true&order=created_at.desc&limit=5000`,
    { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` }, cache: 'no-store' }
  );
  if (!res.ok) {
    if (cache) return cache; // serve stale over an outage
    throw new Error(`Venue data unavailable (${res.status})`);
  }
  const rows = (await res.json()) as Row[];

  // Newest first, so the first time we see a brand is its latest review.
  const seen = new Set<string>();
  const venues: Venue[] = [];
  for (const r of rows) {
    const v = toVenue(r);
    const key = v.name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    venues.push(v);
  }
  cache = venues;
  cachedAt = Date.now();
  return venues;
}

// --- What the browser receives ---------------------------------------------

export interface VenueCard {
  id: string;
  locked: boolean;
  reviewedAt: string;
  venueType: string;
  sites: string;
  location: string;
  /** Categories this venue has data for — shown on locked cards as a teaser. */
  covered: Category[];
  name?: string;
  stack?: Partial<Record<Category, Tool[]>>;
  gaps?: string[];
}

export interface VenueQuery {
  type?: string;
  q?: string; // location
  tool?: string;
  unhappy?: boolean;
  revealedOnly?: boolean;
}

function visibleCategories(ent: Entitlement | null): Category[] {
  if (!ent) return [];
  const c = categoriesFor(ent);
  return c === 'all' ? [...CATEGORIES] : c;
}

function matchesTool(v: Venue, cats: Category[], tool: string, unhappy: boolean): boolean {
  const t = tool.toLowerCase();
  return cats.some(c =>
    (v.stack[c] || []).some(
      x =>
        (!t || x.name.toLowerCase().includes(t)) &&
        (!unhappy || (x.score !== null && x.score <= UNHAPPY_MAX))
    )
  );
}

/**
 * The marketplace listing for one viewer. Filtering by tool runs here, against
 * the viewer's own categories only — so a Starter on POS can find "venues on
 * Lightspeed" but can't probe what anyone uses for Workforce.
 */
export async function listVenues(
  ent: Entitlement | null,
  query: VenueQuery
): Promise<{ venues: VenueCard[]; total: number }> {
  const all = await load();
  const cats = visibleCategories(ent);
  const insights = Boolean(ent?.insights);
  const tool = ent ? (query.tool || '').trim() : '';
  const unhappy = insights && Boolean(query.unhappy);
  const q = (query.q || '').trim().toLowerCase();

  const filtered = all.filter(v => {
    if (query.type && v.venueType !== query.type) return false;
    if (q && !v.location.toLowerCase().includes(q)) return false;
    if (query.revealedOnly && !ent?.revealed.has(v.id)) return false;
    if ((tool || unhappy) && !matchesTool(v, cats, tool, unhappy)) return false;
    return true;
  });

  return { venues: filtered.map(v => card(v, ent, cats, insights)), total: all.length };
}

function card(v: Venue, ent: Entitlement | null, cats: Category[], insights: boolean): VenueCard {
  const base: VenueCard = {
    id: v.id,
    locked: true,
    reviewedAt: v.reviewedAt,
    venueType: v.venueType,
    sites: v.sites,
    location: v.location,
    covered: CATEGORIES.filter(c => v.stack[c]),
  };
  if (!ent || !ent.revealed.has(v.id)) return base;

  const stack: Partial<Record<Category, Tool[]>> = {};
  for (const c of cats) {
    const tools = v.stack[c];
    if (tools) stack[c] = tools.map(t => ({ name: t.name, score: insights ? t.score : null }));
  }
  return {
    ...base,
    locked: false,
    name: v.name,
    stack,
    gaps: insights ? v.gaps : undefined,
  };
}

export async function venueById(id: string): Promise<{ id: string; name: string } | null> {
  const all = await load();
  const v = all.find(x => x.id === id);
  return v ? { id: v.id, name: v.name } : null;
}

/** Headline numbers for the public page — counts only. */
export async function venueStats(): Promise<{ venues: number; newLast30: number }> {
  const all = await load();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return {
    venues: all.length,
    newLast30: all.filter(v => Date.parse(v.reviewedAt) >= cutoff).length,
  };
}

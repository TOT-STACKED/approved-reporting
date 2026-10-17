// Stacked Field route plans: shared types and helpers, safe for the browser.
// Data access lives in field-routes.ts.

import { distanceM, ukDay } from './field-shared';

export type StopStatus = 'planned' | 'visited' | 'skipped';

export interface RouteStop {
  id: string;
  venue_name: string;
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  /** OpenStreetMap / Google place ref, when the stop came from a place search. */
  ref: string | null;
  status: StopStatus;
  visit_id: string | null;
  visited_at: string | null;
}

export interface FieldRoute {
  id: string;
  agent_id: string;
  agent_name?: string | null;
  created_by: string | null;
  name: string;
  period: 'day' | 'week';
  starts_on: string;
  stops: RouteStop[];
  notes: string | null;
  updated_at: string;
}

/** The last day a route covers, as YYYY-MM-DD. */
export function routeEnds(r: Pick<FieldRoute, 'period' | 'starts_on'>): string {
  if (r.period === 'day') return r.starts_on;
  const d = new Date(`${r.starts_on}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Is today (UK) inside this route's day or week? */
export function routeIsCurrent(r: Pick<FieldRoute, 'period' | 'starts_on'>, today = ukDay(Date.now())): boolean {
  return r.starts_on <= today && today <= routeEnds(r);
}

export function progress(r: Pick<FieldRoute, 'stops'>): { done: number; skipped: number; total: number } {
  return {
    done: r.stops.filter(s => s.status === 'visited').length,
    skipped: r.stops.filter(s => s.status === 'skipped').length,
    total: r.stops.length,
  };
}

/**
 * A sensible walking order: nearest stop next, from `start` (the phone, or the
 * first stop). Visited and skipped stops keep their place at the front.
 */
export function bestOrder(stops: RouteStop[], start?: { lat: number; lng: number } | null): RouteStop[] {
  const fixed = stops.filter(s => s.status !== 'planned');
  const left = stops.filter(s => s.status === 'planned');
  if (left.length < 3) return [...fixed, ...left];
  const out: RouteStop[] = [];
  let at: { lat: number; lng: number } = start || fixed[fixed.length - 1] || left[0];
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((s, i) => {
      const d = distanceM(at.lat, at.lng, s.lat, s.lng);
      if (d < bestD) { bestD = d; best = i; }
    });
    const next = left.splice(best, 1)[0];
    out.push(next);
    at = next;
  }
  return [...fixed, ...out];
}

/** Google Maps walking directions through the next stops (Google allows nine waypoints). */
export function directionsUrl(stops: RouteStop[]): string | null {
  const next = stops.filter(s => s.status === 'planned').slice(0, 10);
  if (!next.length) return null;
  const pt = (s: RouteStop) => `${s.lat},${s.lng}`;
  const qs = new URLSearchParams({ api: '1', destination: pt(next[next.length - 1]), travelmode: 'walking' });
  if (next.length > 1) qs.set('waypoints', next.slice(0, -1).map(pt).join('|'));
  return `https://www.google.com/maps/dir/?${qs}`;
}

/** "Mon 20 Oct" or "Week of 20 Oct". */
export function defaultRouteName(period: 'day' | 'week', startsOn: string): string {
  const d = new Date(`${startsOn}T12:00:00Z`);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const short = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return period === 'day' ? day : `Week of ${short}`;
}

/** Monday of the UK week containing `day` (YYYY-MM-DD). */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

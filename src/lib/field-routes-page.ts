// Data the route planner page needs, shared by /field/routes/new and /[id].

import { allRows, listVisits } from './field-db';
import { venueKey, type FieldVisit } from './field-shared';
import { routeEnds, type FieldRoute } from './field-routes-shared';

export interface KnownVenue { id: string; venue_name: string; address: string | null; postcode: string | null; lat: number; lng: number; osm_ref: string | null }

/** Every pinned venue the team knows (latest visit or review of each), to tap onto a route. */
export async function knownVenues(): Promise<KnownVenue[]> {
  const rows = await allRows<KnownVenue & { lat: number | null; lng: number | null }>(
    'field_visits?lat=not.is.null&select=id,venue_name,address,postcode,lat,lng,osm_ref&order=visited_at.desc', 20000,
  );
  const seen = new Set<string>();
  return rows.filter(r => {
    const k = venueKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }) as KnownVenue[];
}

/** The agent's app visits during the route's day or week: where they actually went. */
export async function actualVisits(route: FieldRoute): Promise<FieldVisit[]> {
  const end = new Date(`${routeEnds(route)}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  // UK days: a small margin either side covers BST; filtered exactly below.
  const visits = await listVisits({ agentId: route.agent_id, from: `${route.starts_on}T00:00:00Z`, to: end.toISOString(), limit: 500 })
    .catch(() => []);
  return visits.filter(v => v.source === 'field');
}

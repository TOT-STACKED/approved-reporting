// Route plans for Stacked Field: data access and validation. See
// field-routes-shared.ts for the types and migration 009 for the table.
//
// Agents plan, see and change their own routes; managers can do any agent's.
// A stop is ticked off when a visit is saved for it, either from the route
// ("Start visit here", which names the stop) or by matching: a visit saved
// within 75 m of a planned stop on a route covering today.

import { allRows, rest } from './field-db';
import { distanceM, ukDay, type FieldAgent } from './field-shared';
import { routeIsCurrent, type FieldRoute, type RouteStop } from './field-routes-shared';

const enc = encodeURIComponent;
const UUID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = 'id,agent_id,created_by,name,period,starts_on,stops,notes,updated_at';

type RouteRow = Omit<FieldRoute, 'agent_name'> & { field_agents?: { name: string | null; email: string } | null };

function toRoute(r: RouteRow): FieldRoute {
  const { field_agents, ...rest_ } = r;
  return { ...rest_, stops: Array.isArray(r.stops) ? r.stops : [], agent_name: field_agents ? field_agents.name || field_agents.email : null };
}

export async function listRoutes(f: { agentId?: string; from?: string } = {}): Promise<FieldRoute[]> {
  const q = [`select=${COLUMNS},field_agents!field_routes_agent_id_fkey(name,email)`, 'order=starts_on.desc,created_at.desc'];
  if (f.agentId) q.push(`agent_id=eq.${enc(f.agentId)}`);
  if (f.from && DATE.test(f.from)) q.push(`starts_on=gte.${f.from}`);
  return (await allRows<RouteRow>(`field_routes?${q.join('&')}`, 2000)).map(toRoute);
}

export async function getRoute(id: string): Promise<FieldRoute | null> {
  if (!UUID.test(id)) return null;
  const rows = await rest<RouteRow[]>(`field_routes?id=eq.${id}&select=${COLUMNS},field_agents!field_routes_agent_id_fkey(name,email)&limit=1`);
  return rows[0] ? toRoute(rows[0]) : null;
}

export function canAccessRoute(agent: FieldAgent, route: Pick<FieldRoute, 'agent_id'>): boolean {
  return agent.role === 'manager' || route.agent_id === agent.id;
}

export class RouteInputError extends Error {}

function cleanStops(input: unknown): RouteStop[] {
  if (!Array.isArray(input)) return [];
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const out: RouteStop[] = [];
  const ids = new Set<string>();
  for (const raw of input.slice(0, 80)) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    const name = text(s.venue_name, 200);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    let id = text(s.id, 40).replace(/[^\w-]/g, '') || crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    const status = s.status === 'visited' || s.status === 'skipped' ? s.status : 'planned';
    out.push({
      id,
      venue_name: name,
      address: text(s.address, 300),
      postcode: text(s.postcode, 12).toUpperCase(),
      lat,
      lng,
      ref: typeof s.ref === 'string' && /^((node|way|relation)\/\d+|google\/[\w-]{10,300}|visit\/[0-9a-f-]{36})$/.test(s.ref) ? s.ref : null,
      status,
      visit_id: typeof s.visit_id === 'string' && UUID.test(s.visit_id) ? s.visit_id : null,
      visited_at: typeof s.visited_at === 'string' && !Number.isNaN(Date.parse(s.visited_at)) ? s.visited_at : null,
    });
  }
  return out;
}

/** Validate a route from the browser. Unknown keys are dropped. */
export function cleanRouteInput(input: Record<string, unknown>): Record<string, unknown> {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  if (!name) throw new RouteInputError('Give the route a name');
  const period = input.period === 'week' ? 'week' : 'day';
  const startsOn = typeof input.starts_on === 'string' && DATE.test(input.starts_on) ? input.starts_on : '';
  if (!startsOn) throw new RouteInputError('Pick the date');
  return {
    name,
    period,
    starts_on: startsOn,
    stops: cleanStops(input.stops),
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) || null : null,
  };
}

export async function createRoute(agentId: string, createdBy: string, fields: Record<string, unknown>): Promise<string> {
  const [row] = await rest<{ id: string }[]>('field_routes?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...fields, agent_id: agentId, created_by: createdBy }),
  });
  return row.id;
}

export async function updateRoute(id: string, fields: Record<string, unknown>): Promise<void> {
  await rest(`field_routes?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

export async function deleteRoute(id: string): Promise<void> {
  await rest(`field_routes?id=eq.${id}`, { method: 'DELETE' });
}

/**
 * Tick off the route stop a new visit was for. Named stop first ("Start visit
 * here"); otherwise the nearest planned stop within 75 m on one of the agent's
 * routes covering today. Best effort: never fails the visit save.
 */
export async function markStopVisited(
  agentId: string,
  visit: { id: string; visited_at: string; lat: number; lng: number; osm_ref: string | null },
  named?: { route_id?: unknown; stop_id?: unknown },
): Promise<void> {
  const tick = async (route: FieldRoute, stopId: string) => {
    const stops = route.stops.map(s => s.id === stopId ? { ...s, status: 'visited' as const, visit_id: visit.id, visited_at: visit.visited_at } : s);
    await updateRoute(route.id, { stops });
  };

  if (typeof named?.route_id === 'string' && typeof named.stop_id === 'string') {
    const route = await getRoute(named.route_id);
    if (route && route.agent_id === agentId && route.stops.some(s => s.id === named.stop_id)) {
      await tick(route, named.stop_id);
      return;
    }
  }

  const today = ukDay(Date.now());
  const weekAgo = ukDay(Date.now() - 6 * 86400000);
  const candidates = (await listRoutes({ agentId, from: weekAgo })).filter(r => routeIsCurrent(r, today));
  let best: { route: FieldRoute; stop: RouteStop; d: number } | null = null;
  for (const route of candidates) {
    for (const stop of route.stops) {
      if (stop.status !== 'planned') continue;
      const d = stop.ref && stop.ref === visit.osm_ref ? 0 : distanceM(visit.lat, visit.lng, stop.lat, stop.lng);
      if (d <= 75 && (!best || d < best.d)) best = { route, stop, d };
    }
  }
  if (best) await tick(best.route, best.stop.id);
}

import { redirect } from 'next/navigation';
import { FieldHeader } from '@/components/field/FieldChrome';
import VisitForm from '@/components/field/VisitForm';
import { currentAgent } from '@/lib/field-db';
import { canAccessRoute, getRoute } from '@/lib/field-routes';

export const dynamic = 'force-dynamic';

// ?route=&stop= comes from "Start visit here" on a route: the visit starts at
// that stop's venue, and saving it ticks the stop off.
export default async function NewVisit({ searchParams }: { searchParams: Promise<{ route?: string; stop?: string }> }) {
  const agent = await currentAgent();
  if (!agent) redirect('/field/signin');
  const { route: routeId, stop: stopId } = await searchParams;

  let fromStop: { route_id: string; stop_id: string; venue_name: string; address: string; postcode: string; lat: number; lng: number; ref: string | null } | undefined;
  if (routeId && stopId) {
    const route = await getRoute(routeId).catch(() => null);
    const stop = route && canAccessRoute(agent, route) ? route.stops.find(s => s.id === stopId) : null;
    if (route && stop) fromStop = { route_id: route.id, stop_id: stop.id, venue_name: stop.venue_name, address: stop.address, postcode: stop.postcode, lat: stop.lat, lng: stop.lng, ref: stop.ref };
  }

  return (
    <>
      <FieldHeader title="New visit" back={fromStop ? `/field/routes/${fromStop.route_id}` : '/field'} />
      <VisitForm fromStop={fromStop} />
    </>
  );
}

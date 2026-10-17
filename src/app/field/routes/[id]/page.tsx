import { notFound, redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import RouteEditor from '@/components/field/RouteEditor';
import { currentAgent, listAgents } from '@/lib/field-db';
import { canAccessRoute, getRoute } from '@/lib/field-routes';
import { actualVisits, knownVenues } from '@/lib/field-routes-page';

export const dynamic = 'force-dynamic';

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentAgent();
  if (!me) redirect('/field/signin');
  const { id } = await params;
  const route = await getRoute(id);
  if (!route || !canAccessRoute(me, route)) notFound();
  const [agents, known, actual] = await Promise.all([
    me.role === 'manager' ? listAgents() : Promise.resolve([me]),
    knownVenues().catch(() => []),
    actualVisits(route),
  ]);
  return (
    <>
      <FieldHeader title={route.name} back="/field/routes" />
      <RouteEditor route={route} me={me} agents={agents} known={known} actual={actual} />
      <FieldTabs manager={me.role === 'manager'} />
    </>
  );
}

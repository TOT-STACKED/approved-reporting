import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import RouteEditor from '@/components/field/RouteEditor';
import { currentAgent, listAgents } from '@/lib/field-db';
import { knownVenues } from '@/lib/field-routes-page';

export const dynamic = 'force-dynamic';

export default async function NewRoute() {
  const me = await currentAgent();
  if (!me) redirect('/field/signin');
  const [agents, known] = await Promise.all([
    me.role === 'manager' ? listAgents() : Promise.resolve([me]),
    knownVenues().catch(() => []),
  ]);
  return (
    <>
      <FieldHeader title="Plan a route" back="/field/routes" />
      <RouteEditor me={me} agents={agents} known={known} actual={[]} />
      <FieldTabs manager={me.role === 'manager'} />
    </>
  );
}

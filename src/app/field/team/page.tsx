import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import TeamView from '@/components/field/TeamView';
import { currentAgent, listAgents, rest } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

export default async function Team() {
  const me = await currentAgent();
  if (!me) redirect('/field/signin');
  if (me.role !== 'manager') redirect('/field');
  const [agents, imported] = await Promise.all([
    listAgents(),
    rest<unknown[]>('field_visits?source=eq.intelligence&select=id&limit=10000').then(r => r.length).catch(() => 0),
  ]);
  return (
    <>
      <FieldHeader title="Team" back="/field/manage" />
      <TeamView agents={agents} meId={me.id} imported={imported} />
      <FieldTabs manager />
    </>
  );
}

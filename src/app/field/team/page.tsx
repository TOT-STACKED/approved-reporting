import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import TeamView from '@/components/field/TeamView';
import { currentAgent, listAgents } from '@/lib/field-db';
import { importStatus } from '@/lib/field-import';

export const dynamic = 'force-dynamic';

export default async function Team() {
  const me = await currentAgent();
  if (!me) redirect('/field/signin');
  if (me.role !== 'manager') redirect('/field');
  const [agents, status] = await Promise.all([
    listAgents(),
    importStatus().catch(() => ({ reviews: 0, imported: 0 })),
  ]);
  return (
    <>
      <FieldHeader title="Team" back="/field/manage" />
      <TeamView agents={agents} meId={me.id} status={status} />
      <FieldTabs manager />
    </>
  );
}

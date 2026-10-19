import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import ManageView from '@/components/field/ManageView';
import { currentAgent, listAgents, listVisits } from '@/lib/field-db';
import { listTargetLists, targetsWithStatus } from '@/lib/field-targets';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Managers: where everyone has been. Every visit is loaded once and filtered
// on the phone, which is fine into the low thousands.
export default async function Manage() {
  const agent = await currentAgent();
  if (!agent) redirect('/field/signin');
  if (agent.role !== 'manager') redirect('/field');

  const [agents, visits, targets, targetLists] = await Promise.all([
    listAgents(),
    listVisits({ limit: 20000 }),
    targetsWithStatus().catch(() => []),
    listTargetLists().catch(() => []),
  ]);

  return (
    <>
      <FieldHeader
        title="Team map"
        back="/field"
        right={<Link href="/field/team" className="flex h-11 items-center rounded-full px-3 text-sm font-bold text-white/90 active:bg-white/10">Team</Link>}
      />
      <ManageView agents={agents} visits={visits} targets={targets} targetLists={targetLists} />
      <FieldTabs manager />
    </>
  );
}

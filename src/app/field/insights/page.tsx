import { redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import InsightsView from '@/components/field/InsightsView';
import { currentAgent, listAgents, listVisits } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// What the field team is finding. Everyone on the team can see it; contact
// details are left out before anything reaches the browser.
export default async function Insights() {
  const me = await currentAgent();
  if (!me) redirect('/field/signin');
  const [agents, visits] = await Promise.all([listAgents(), listVisits({ limit: 20000 })]);
  const slim = visits.map(v => ({
    id: v.id, visited_at: v.visited_at, agent_id: v.agent_id, source: v.source, submission_id: v.submission_id,
    venue_name: v.venue_name, postcode: v.postcode, lat: v.lat, lng: v.lng, venue_type: v.venue_type,
    ownership: v.ownership, stack: v.stack, demo_interest: v.demo_interest, photos: v.photos.length,
  }));
  return (
    <>
      <FieldHeader title="Insights" back="/field" />
      <InsightsView agents={agents.map(a => ({ id: a.id, name: a.name || a.email.split('@')[0] }))} visits={slim} />
      <FieldTabs manager={me.role === 'manager'} />
    </>
  );
}

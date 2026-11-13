import { redirect } from 'next/navigation';
import RenewalsCompare from '@/components/renewals/RenewalsCompare';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';
import { sessionEmail } from '@/lib/renewals-auth';
import { listProposals, listTools, viewerFor } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export default async function RenewalsComparePage() {
  const email = await sessionEmail();
  if (!email) redirect('/renewals/signin');
  const viewer = await viewerFor(email);
  if (!viewer) redirect('/renewals/start');
  const [tools, proposals] = await Promise.all([listTools(viewer.org.id), listProposals(viewer.org.id)]);
  return (
    <>
      <RenewalsHeader orgName={viewer.org.name} />
      <RenewalsCompare tools={tools} initialProposals={proposals} orgSiteCount={viewer.org.site_count} />
    </>
  );
}

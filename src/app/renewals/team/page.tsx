import { redirect } from 'next/navigation';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';
import RenewalsTeam from '@/components/renewals/RenewalsTeam';
import { sessionEmail } from '@/lib/renewals-auth';
import { listMembers, viewerFor } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export default async function RenewalsTeamPage() {
  const viewer = await viewerFor(await sessionEmail());
  if (!viewer) redirect('/renewals/signin');
  const members = await listMembers(viewer.org.id);
  return (
    <>
      <RenewalsHeader orgName={viewer.org.name} />
      <RenewalsTeam orgName={viewer.org.name} initialMembers={members} me={viewer.member} />
    </>
  );
}

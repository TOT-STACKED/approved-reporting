import { redirect } from 'next/navigation';
import RenewalsApp from '@/components/renewals/RenewalsApp';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';
import { sessionEmail } from '@/lib/renewals-auth';
import { listTools, viewerFor } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export default async function RenewalsPage() {
  const viewer = await viewerFor(await sessionEmail());
  if (!viewer) redirect('/renewals/signin');
  const tools = await listTools(viewer.org.id);
  return (
    <>
      <RenewalsHeader orgName={viewer.org.name} />
      <RenewalsApp orgName={viewer.org.name} initialTools={tools} />
    </>
  );
}

import { redirect } from 'next/navigation';
import RenewalsApp from '@/components/renewals/RenewalsApp';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';
import { sessionEmail } from '@/lib/renewals-auth';
import { listTools, viewerFor } from '@/lib/renewals-db';
import { ratingsDirectorySafe } from '@/lib/renewals-ratings';

export const dynamic = 'force-dynamic';

export default async function RenewalsPage() {
  const email = await sessionEmail();
  if (!email) redirect('/renewals/signin');
  const viewer = await viewerFor(email);
  if (!viewer) redirect('/renewals/start');
  const [tools, ratings] = await Promise.all([listTools(viewer.org.id), ratingsDirectorySafe()]);
  return (
    <>
      <RenewalsHeader orgName={viewer.org.name} />
      <RenewalsApp orgName={viewer.org.name} initialTools={tools} ratings={ratings} />
    </>
  );
}

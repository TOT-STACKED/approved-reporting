import { redirect } from 'next/navigation';
import IntelligenceOnboarding from '@/components/renewals/IntelligenceOnboarding';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';
import { sessionEmail } from '@/lib/renewals-auth';
import { findMember } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

// New to Stacked: do the Intelligence Review, and the account is made from it.
export default async function RenewalsStartPage() {
  const email = await sessionEmail();
  if (!email) redirect('/renewals/signin');
  if (await findMember(email)) redirect('/renewals');
  return (
    <>
      <RenewalsHeader />
      <IntelligenceOnboarding email={email} />
    </>
  );
}

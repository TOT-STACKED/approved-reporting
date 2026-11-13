import { redirect } from 'next/navigation';
import RenewalsCompare from '@/components/renewals/RenewalsCompare';
import RenewalsHeader from '@/components/renewals/RenewalsHeader';
import { sessionEmail } from '@/lib/renewals-auth';
import { intelligenceFor, listProposals, listTools, viewerFor } from '@/lib/renewals-db';
import { ratingsDirectorySafe } from '@/lib/renewals-ratings';
import { productKey } from '@/lib/renewals-ratings-shared';

export const dynamic = 'force-dynamic';

export default async function RenewalsComparePage() {
  const email = await sessionEmail();
  if (!email) redirect('/renewals/signin');
  const viewer = await viewerFor(email);
  if (!viewer) redirect('/renewals/start');
  const [tools, proposals, ratings, intel] = await Promise.all([
    listTools(viewer.org.id),
    listProposals(viewer.org.id),
    ratingsDirectorySafe(),
    intelligenceFor(viewer.org).catch(() => null),
  ]);
  // The venue's own 0–10 ratings from its Intelligence Review, so it can see its view next to everyone else's.
  const ownRatings: Record<string, number> = {};
  for (const [name, score] of Object.entries(intel?.product_nps || {})) {
    const key = productKey(name);
    if (key && typeof score === 'number') ownRatings[key] = score;
  }
  return (
    <>
      <RenewalsHeader orgName={viewer.org.name} />
      <RenewalsCompare tools={tools} initialProposals={proposals} orgSiteCount={viewer.org.site_count} ratings={ratings} ownRatings={ownRatings} />
    </>
  );
}

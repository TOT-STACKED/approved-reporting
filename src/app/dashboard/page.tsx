import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PARTNER_SESSION_COOKIE, verifySessionCookie, getTokenMap } from '@/lib/partner-auth';
import SecurePartnerPage from '../p/[token]/page';

export const dynamic = 'force-dynamic';

// The signed-in home. Resolves the session cookie to a partner, then renders
// exactly the same dashboard the token link renders — so there is one view to
// maintain, not two. Partners who signed in never see a token in the URL.
export default async function DashboardPage() {
  const jar = await cookies();
  const session = verifySessionCookie(jar.get(PARTNER_SESSION_COOKIE)?.value);
  if (!session) redirect('/signin');

  const token = Object.entries(getTokenMap()).find(([, s]) => s === session.slug)?.[0];
  // A session for a partner whose link has since been revoked: treat it as
  // signed out rather than showing an empty dashboard.
  if (!token) redirect('/signin?expired=1');

  return <SecurePartnerPage tokenOverride={token} />;
}

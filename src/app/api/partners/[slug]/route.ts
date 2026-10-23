import { NextResponse } from 'next/server';
import { getPartnerDetail, partnerSlugAliases, toClientPartner } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';
import { tierForSlug } from '@/lib/partner-package';
import { getTokenMap } from '@/lib/partner-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const partner = await getPartnerDetail(slug);

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // NPS is served by ./score now — same rows, one read. See the token route.
    const stackCollect = await getPartnerStackCollectData(partner.name);

    // The team always sees everything here; the tier rides along so the page
    // can say what the partner's own link shows them.
    //
    // partnerUrl is that link. This route is behind the team session, and the
    // same tokens are already in PARTNER_LINKS.md, so handing it over saves a
    // trip to the repo when someone wants to check what a partner sees.
    // Whenever partner logins land, this becomes /login-as or similar and
    // nothing else on the page has to change.
    //
    // Match on every spelling the partner is known by, not just this page's.
    // A link is issued once and the slug it was issued on rarely matches the
    // one this page is served under — Planday's page is `planday-from-xero`
    // and their token says `planday`, SevenRooms is `sevenrooms` against
    // `seven-rooms`, RYE is `rye` against `rye-energy`. An exact comparison
    // here hid the button for all three while their dashboards worked fine,
    // which reads as "this partner has no link" and is how Wolverton and
    // Fydelia went unnoticed. Same walk as tierForSlug.
    const aliases = new Set(partnerSlugAliases(slug));
    const tokenMap = getTokenMap();
    const token =
      Object.entries(tokenMap).find(([, s]) => aliases.has(s.trim().toLowerCase()))?.[0] || null;

    return NextResponse.json({
      partner: toClientPartner(partner),
      stackCollect,
      tier: await tierForSlug(slug),
      partnerUrl: token ? `/p/${token}` : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

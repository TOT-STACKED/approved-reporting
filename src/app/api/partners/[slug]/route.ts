import { NextResponse } from 'next/server';
import { getPartnerDetail, toClientPartner } from '@/lib/airtable';
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
    const token = Object.entries(getTokenMap()).find(([, s]) => s === slug)?.[0] || null;

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

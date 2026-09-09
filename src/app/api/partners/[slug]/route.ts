import { NextResponse } from 'next/server';
import { getPartnerDetail, toClientPartner } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';
import { tierForSlug } from '@/lib/partner-package';

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
    return NextResponse.json({ partner: toClientPartner(partner), stackCollect, tier: await tierForSlug(slug) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

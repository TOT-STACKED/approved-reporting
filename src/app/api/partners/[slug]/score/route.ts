import { NextResponse } from 'next/server';
import { getPartnerDetail } from '@/lib/airtable';
import { getPartnerScoreIntelligence } from '@/lib/stackcollect';

export const dynamic = 'force-dynamic';

// Internal twin of /api/p/[token]/score — same payload, session-authed rather
// than token-authed, so the team can see exactly what a partner sees before
// getting on a call with them.

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

    const score = await getPartnerScoreIntelligence(partner.name);
    return NextResponse.json({ partner: { name: partner.name }, score });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

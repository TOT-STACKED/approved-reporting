import { NextResponse } from 'next/server';
import { getPartnerDetail, emptyPartnerDetail } from '@/lib/airtable';
import { getPartnerStackCollectData, getPartnerNpsRollup } from '@/lib/stackcollect';

export const dynamic = 'force-dynamic';

function getTokenMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.PARTNER_TOKENS || '{}');
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenMap = getTokenMap();
    const slug = tokenMap[token];

    if (!slug) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    // The token is valid, so the partner is real — a null detail just means
    // no leads are tagged to them yet. Serve an empty dashboard so a
    // freshly onboarded partner's link works from day one. `empty` lets the
    // client keep its cold-start retry: a partial Airtable read looks the
    // same as a genuinely lead-free partner from here.
    const detail = await getPartnerDetail(slug);
    const partner = detail || emptyPartnerDetail(slug);

    const [stackCollect, nps] = await Promise.all([
      getPartnerStackCollectData(partner.name),
      getPartnerNpsRollup(partner.name),
    ]);

    return NextResponse.json({ partner, stackCollect, nps, empty: !detail });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

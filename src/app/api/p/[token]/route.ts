import { NextResponse } from 'next/server';
import { getPartnerDetail } from '@/lib/airtable';
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

    const partner = await getPartnerDetail(slug);

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const [stackCollect, nps] = await Promise.all([
      getPartnerStackCollectData(partner.name),
      getPartnerNpsRollup(partner.name),
    ]);

    return NextResponse.json({ partner, stackCollect, nps });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

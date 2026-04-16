import { NextResponse } from 'next/server';
import { getPartnerDetail, getMetrics, getMarketingActivities, getActivitiesForPartner } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';

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

    const [partner, metrics, allActivities] = await Promise.all([
      getPartnerDetail(slug),
      getMetrics(),
      getMarketingActivities(),
    ]);

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const partnerMetrics = metrics.filter(
      m => m.partnerName.trim().toLowerCase() === partner.name.trim().toLowerCase()
    );

    const partnerActivities = getActivitiesForPartner(allActivities, partner.name);
    const stackCollect = await getPartnerStackCollectData(partner.name);

    return NextResponse.json({
      partner,
      metrics: partnerMetrics,
      activities: partnerActivities,
      stackCollect,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getPartnerDetail, getMetrics } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const [partner, metrics] = await Promise.all([
      getPartnerDetail(slug),
      getMetrics(),
    ]);

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const partnerMetrics = metrics.filter(
      m => m.partnerName.trim().toLowerCase() === partner.name.trim().toLowerCase()
    );

    const stackCollect = await getPartnerStackCollectData(partner.name);

    return NextResponse.json({ partner, metrics: partnerMetrics, stackCollect });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

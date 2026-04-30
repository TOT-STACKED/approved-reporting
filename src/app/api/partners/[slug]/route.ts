import { NextResponse } from 'next/server';
import { getPartnerDetail } from '@/lib/airtable';
import { getPartnerStackCollectData, getPartnerNpsRollup } from '@/lib/stackcollect';

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

    const [stackCollect, nps] = await Promise.all([
      getPartnerStackCollectData(partner.name),
      getPartnerNpsRollup(partner.name),
    ]);

    return NextResponse.json({ partner, stackCollect, nps });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

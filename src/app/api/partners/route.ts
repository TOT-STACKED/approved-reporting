import { NextResponse } from 'next/server';
import { getPartnerList } from '@/lib/airtable';

// Force dynamic — without this, Netlify's edge served stale/partial
// responses from a prior cold-start timeout, showing e.g. 100 leads
// instead of 1100 until the user refreshed.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const partners = await getPartnerList();
    return NextResponse.json({ partners });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

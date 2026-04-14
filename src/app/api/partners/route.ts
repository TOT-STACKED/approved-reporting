import { NextResponse } from 'next/server';
import { getPartnerList } from '@/lib/airtable';

export async function GET() {
  try {
    const partners = await getPartnerList();
    return NextResponse.json({ partners });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

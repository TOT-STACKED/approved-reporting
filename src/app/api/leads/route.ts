import { NextResponse } from 'next/server';
import { getAllLeads } from '@/lib/leads';

// Force dynamic — same reason as /api/partners: without this, Netlify's
// edge cache occasionally served a stale/partial response (e.g. 100 leads
// instead of 1100) until the user hit refresh.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const leads = await getAllLeads();
    return NextResponse.json({ leads, total: leads.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getAllLeads } from '@/lib/leads';

export async function GET() {
  try {
    const leads = await getAllLeads();
    return NextResponse.json({ leads, total: leads.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getMetrics, writeMetrics } from '@/lib/airtable';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const partner = searchParams.get('partner') || undefined;
    const metrics = await getMetrics(partner);
    return NextResponse.json({ metrics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { partnerName, weekStarting, sessions, users, pageViews, bounceRate } = body;

    if (!partnerName || !weekStarting) {
      return NextResponse.json({ error: 'partnerName and weekStarting are required' }, { status: 400 });
    }

    await writeMetrics({
      partnerName,
      weekStarting,
      sessions: Number(sessions) || 0,
      users: Number(users) || 0,
      pageViews: Number(pageViews) || 0,
      bounceRate: Number(bounceRate) || 0,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

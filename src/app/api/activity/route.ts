import { NextResponse } from 'next/server';
import { getMarketingActivities, writeMarketingActivity } from '@/lib/airtable';

export async function GET() {
  try {
    const activities = await getMarketingActivities();
    return NextResponse.json({ activities });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.activityTitle || !body.activityType || !body.date) {
      return NextResponse.json({ error: 'Title, type, and date are required' }, { status: 400 });
    }

    await writeMarketingActivity({
      activityTitle: body.activityTitle,
      activityType: body.activityType,
      date: body.date,
      partnersFeatured: body.partnersFeatured || '',
      impressions: Number(body.impressions) || 0,
      engagements: Number(body.engagements) || 0,
      clickThroughs: Number(body.clickThroughs) || 0,
      leadsGenerated: Number(body.leadsGenerated) || 0,
      pipelineValue: Number(body.pipelineValue) || 0,
      url: body.url || '',
      notes: body.notes || '',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

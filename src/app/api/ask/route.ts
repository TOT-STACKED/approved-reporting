import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getPartnerList, getMarketingActivities, getMetrics } from '@/lib/airtable';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Fetch all portal data in parallel
    const [partners, activities, metrics] = await Promise.all([
      getPartnerList(),
      getMarketingActivities(),
      getMetrics(),
    ]);

    // Build a concise data summary for the AI
    const allStatuses: Record<string, number> = {};
    partners.forEach(p => {
      Object.entries(p.statusBreakdown).forEach(([status, count]) => {
        allStatuses[status] = (allStatuses[status] || 0) + count;
      });
    });

    const dataContext = JSON.stringify({
      partners: partners.map(p => ({
        name: p.name,
        leadCount: p.leadCount,
        statusBreakdown: p.statusBreakdown,
      })),
      overallStatusTotals: allStatuses,
      totalLeads: partners.reduce((s, p) => s + p.leadCount, 0),
      totalPartners: partners.length,
      recentActivities: activities.slice(0, 20).map(a => ({
        title: a.activityTitle,
        type: a.activityType,
        date: a.date,
        partnersFeatured: a.partnersFeatured,
        impressions: a.impressions,
        engagements: a.engagements,
        leadsGenerated: a.leadsGenerated,
        pipelineValue: a.pipelineValue,
      })),
      totalActivities: activities.length,
      totalImpressions: activities.reduce((s, a) => s + a.impressions, 0),
      totalEngagements: activities.reduce((s, a) => s + a.engagements, 0),
      totalPipelineValue: activities.reduce((s, a) => s + a.pipelineValue, 0),
      recentMetrics: metrics.slice(-10).map(m => ({
        partner: m.partnerName,
        week: m.weekStarting,
        sessions: m.sessions,
        users: m.users,
        pageViews: m.pageViews,
      })),
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful data assistant for Tech on Toast, a hospitality tech community. You answer questions about partner performance, leads, marketing activities, and metrics based on the data provided.

Be concise, specific, and use actual numbers from the data. If you list items, use bullet points. Keep answers to 2-4 sentences unless the question requires a detailed breakdown.

Lead statuses in the pipeline: MAL (Marketing Accepted Lead) → MQL → SQL → In Conversation → Opportunity → Live Closed (won) / Lost / nurture

Here is the current portal data:
${dataContext}`,
        },
        {
          role: 'user',
          content: question,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content || 'Sorry, I couldn\'t generate an answer.';

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Ask API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process question' }, { status: 500 });
  }
}

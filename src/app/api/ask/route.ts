import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getPartnerList } from '@/lib/airtable';
import { getTechStackEntries, getBusinessSubmissions, getToolUsageStats, getPOSMarketShare } from '@/lib/stackcollect';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Fetch all portal data in parallel (including individual leads + stack data)
    const [partners, leadsRes, stackEntries, businesses, toolUsage, posMarketShare] = await Promise.all([
      getPartnerList(),
      fetch(new URL('/api/leads', request.url)).then(r => r.json()),
      getTechStackEntries(),
      getBusinessSubmissions(),
      getToolUsageStats(),
      getPOSMarketShare(),
    ]);

    const leads = leadsRes.leads || [];

    // Process stack data into submission-level summaries
    const stackSubmissions: Record<string, { created_at: string; tools: { category: string; tool_name: string }[] }> = {};
    for (const e of stackEntries) {
      if (!stackSubmissions[e.submission_id]) {
        stackSubmissions[e.submission_id] = { created_at: e.created_at, tools: [] };
      }
      stackSubmissions[e.submission_id].tools.push({ category: e.category, tool_name: e.tool_name });
    }
    const stackReviews = Object.values(stackSubmissions).sort((a, b) => b.created_at.localeCompare(a.created_at));

    // Top tools from stack
    const toolCounts: Record<string, number> = {};
    const catCounts: Record<string, number> = {};
    for (const e of stackEntries) {
      const key = e.tool_name.toLowerCase().trim();
      toolCounts[key] = (toolCounts[key] || 0) + 1;
      catCounts[e.category] = (catCounts[e.category] || 0) + 1;
    }
    const stackTopTools = Object.entries(toolCounts).sort(([, a], [, b]) => b - a).slice(0, 20).map(([name, count]) => ({ name, count }));
    const stackCategories = Object.entries(catCounts).sort(([, a], [, b]) => b - a).map(([category, count]) => ({ category, count }));

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
      allLeads: leads.map((l: any) => ({
        businessName: l.businessName,
        status: l.status,
        partners: l.partners,
        source: l.source,
        owner: l.owner,
        location: l.location,
        lastModified: l.lastModified,
      })),
      overallStatusTotals: allStatuses,
      totalLeads: leads.length,
      totalPartners: partners.length,
      stackCollect: {
        totalReviews: stackReviews.length,
        totalToolEntries: stackEntries.length,
        topTools: stackTopTools,
        categories: stackCategories,
        recentReviews: stackReviews.slice(0, 15).map(r => ({
          date: r.created_at.split('T')[0],
          toolCount: r.tools.length,
          tools: r.tools.map(t => `${t.tool_name} (${t.category})`),
        })),
      },
      businessSubmissions: businesses.map((b: any) => ({
        businessName: b.business_name,
        industry: b.industry,
        size: b.size,
        location: b.location,
        role: b.role,
        numberOfLocations: b.number_of_locations,
        submissionType: b.submission_type,
        date: b.created_at?.split('T')[0],
      })),
      totalBusinessSubmissions: businesses.length,
      toolUsageAnalytics: toolUsage.slice(0, 30).map((t: any) => ({
        tool: t.tool_name,
        category: t.category,
        usageCount: t.usage_count,
        uniqueBusinesses: t.unique_businesses,
      })),
      posMarketShare: posMarketShare.map((p: any) => ({
        tool: p.tool_name,
        usageCount: p.usage_count,
        marketShare: p.market_share_percentage,
      })),
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful data assistant for Tech on Toast, a hospitality tech community. You answer questions about partner performance, leads, marketing activities, and metrics based on the data provided.

Be concise, specific, and use actual numbers from the data. If you list items, use bullet points. Keep answers to 2-4 sentences unless the question requires a detailed breakdown.

The data includes every individual lead/client with their business name, status, partner, source, owner, and location. Use this to answer questions about specific businesses or clients.

Lead statuses in the pipeline: MAL (Marketing Accepted Lead) → MQL → SQL → In Conversation → Opportunity → Live Closed (won) / Lost / nurture

"Partners" are the tech companies (e.g. Lightspeed, Sona, Square). "Leads" are the hospitality businesses/restaurants/clients being referred to those partners.

The data also includes StackCollect tech stack review data. Each "review" or "stack" is a submission from a hospitality venue showing which tech tools they use. The businessSubmissions array contains every venue that submitted a review — with their business name, industry, location, size, and number of locations. You can answer questions about specific venues, the most popular tools, POS market share, categories, and review counts. The toolUsageAnalytics and posMarketShare arrays contain pre-aggregated usage statistics.

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

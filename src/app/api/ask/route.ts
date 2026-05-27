import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getPartnerList } from '@/lib/airtable';
import { getAllLeads } from '@/lib/leads';
import { getTechStackEntries, getBusinessSubmissions, getToolUsageStats, getPOSMarketShare } from '@/lib/stackcollect';

// Lazy-init so a missing/misconfigured OPENAI_API_KEY surfaces as a clean
// JSON error from the handler rather than crashing the whole route module on
// import (which Next serves as an opaque HTML 500).
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI is not configured' }, { status: 503 });
    }

    const { question, partnerSlug } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Fetch all portal data in parallel (including individual leads + stack data)
    const [partners, allLeadsRaw, stackEntries, businesses, toolUsage, posMarketShare] = await Promise.all([
      getPartnerList(),
      getAllLeads(),
      getTechStackEntries(),
      getBusinessSubmissions(),
      getToolUsageStats(),
      getPOSMarketShare(),
    ]);

    // Resolve partner from slug (if provided) — used to scope answers
    let scopedPartner: { name: string; slug: string } | null = null;
    if (partnerSlug && typeof partnerSlug === 'string') {
      const found = partners.find(p => p.slug === partnerSlug);
      if (found) scopedPartner = { name: found.name, slug: found.slug };
    }

    // When scoped to a partner, only include leads where that partner appears
    // in any of the stage fields, and tag each lead with its stage for that partner.
    const partnerLower = scopedPartner ? scopedPartner.name.trim().toLowerCase() : '';
    const filteredLeads = scopedPartner
      ? allLeadsRaw
          .filter((l: any) =>
            (l.partners || []).some((p: string) => (p || '').trim().toLowerCase() === partnerLower)
          )
          .map((l: any) => {
            // Highest-stage-wins for this specific partner
            const stages = l.stages || {};
            const ORDER = ['MAL', 'MQL', 'SQL', 'Closed Lost', 'Closed Won'];
            let stageForPartner = '';
            for (const stage of ORDER) {
              const list: string[] = stages[stage] || [];
              if (list.some(p => (p || '').trim().toLowerCase() === partnerLower)) {
                stageForPartner = stage;
              }
            }
            return { ...l, status: stageForPartner || l.status };
          })
      : allLeadsRaw;

    const leads = filteredLeads;

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

    // Slim lead representation — keep only fields the AI actually needs.
    // Sort so that, if we have to trim to fit the token budget, we keep the
    // most useful leads: active pipeline stages first, then most recent.
    const STAGE_RANK: Record<string, number> = {
      'Closed Won': 0, SQL: 1, MQL: 2, 'Closed Lost': 3, MAL: 4,
    };
    const slimLeads = leads
      .slice()
      .sort((a: any, b: any) => {
        const ra = STAGE_RANK[a.status] ?? 5;
        const rb = STAGE_RANK[b.status] ?? 5;
        if (ra !== rb) return ra - rb;
        return (b.lastModified || '').localeCompare(a.lastModified || '');
      })
      .map((l: any) => ({
        name: l.businessName,
        status: l.status,
        ...(scopedPartner ? {} : { partners: l.partners }),
        source: l.source,
        location: l.location,
        lastModified: l.lastModified ? l.lastModified.split('T')[0] : '',
      }));

    // GPT-4o-mini caps at 128k tokens. Keep the data context well under that
    // (the system-prompt wrapper, the question and the response also count).
    // Rough heuristic: ~4 chars per token. Trim the leads array — by far the
    // biggest contributor — until the serialised context fits.
    const MAX_CONTEXT_CHARS = 90_000 * 4; // ~90k tokens of data

    const buildContext = (leadSlice: typeof slimLeads) =>
      JSON.stringify({
        ...(scopedPartner ? {} : {
          partners: partners.map(p => ({
            name: p.name,
            leadCount: p.leadCount,
            statusBreakdown: p.statusBreakdown,
          })),
          overallStatusTotals: allStatuses,
          totalPartners: partners.length,
        }),
        ...(scopedPartner ? {
          scopedPartner: scopedPartner.name,
          partnerLeadCount: leads.length,
        } : {}),
        leads: leadSlice,
        totalLeads: leads.length,
        ...(leadSlice.length < slimLeads.length
          ? { leadsNote: `Showing the ${leadSlice.length} highest-priority leads of ${leads.length} total (trimmed to fit). Counts/totals above still reflect ALL leads.` }
          : {}),
        stackCollect: {
          totalReviews: stackReviews.length,
          totalToolEntries: stackEntries.length,
          topTools: stackTopTools.slice(0, 15),
          categories: stackCategories.slice(0, 15),
        },
        ...(scopedPartner ? {} : {
          recentSubmissions: businesses.slice(0, 50).map((b: any) => ({
            name: b.business_name,
            industry: b.industry,
            location: b.location,
            locations: b.number_of_locations,
            date: b.created_at?.split('T')[0],
          })),
          totalBusinessSubmissions: businesses.length,
        }),
        toolUsageAnalytics: toolUsage.slice(0, 20).map((t: any) => ({
          tool: t.tool_name,
          category: t.category,
          usageCount: t.usage_count,
        })),
        posMarketShare: posMarketShare.map((p: any) => ({
          tool: p.tool_name,
          usageCount: p.usage_count,
          marketShare: p.market_share_percentage,
        })),
      });

    let leadCap = slimLeads.length;
    let dataContext = buildContext(slimLeads);
    while (dataContext.length > MAX_CONTEXT_CHARS && leadCap > 50) {
      leadCap = Math.floor(leadCap * 0.7);
      dataContext = buildContext(slimLeads.slice(0, leadCap));
    }

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: scopedPartner
            ? `You are a helpful data assistant for ${scopedPartner.name}, a partner of Tech on Toast (a hospitality tech community).

You answer questions about ${scopedPartner.name}'s leads ONLY — the data below has already been filtered to leads where ${scopedPartner.name} is involved at any pipeline stage. Each lead's "status" is its current stage for ${scopedPartner.name} specifically (MAL, MQL, SQL, Closed Won, or Closed Lost). Do not reveal data about other partners or other partners' specific leads.

Be concise, specific, and use actual numbers from the data. Use bullet points for lists. Keep answers to 2-4 sentences unless a detailed breakdown is needed.

Pipeline stages: MAL → MQL → SQL → Closed Won / Closed Lost.

Here is ${scopedPartner.name}'s lead data and the marketplace context:
${dataContext}`
            : `You are a helpful data assistant for Tech on Toast, a hospitality tech community. You answer questions about partner performance, leads, marketing activities, and metrics based on the data provided.

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

import { NextResponse } from 'next/server';
import { getTechStackEntries, getBusinessSubmissions, getToolUsageStats, getPOSMarketShare, getFieldObservedVenues } from '@/lib/stackcollect';

export async function GET() {
  try {
    const [entries, businesses, toolUsage, posData, observed] = await Promise.all([
      getTechStackEntries(),
      getBusinessSubmissions(),
      getToolUsageStats(),
      getPOSMarketShare(),
      getFieldObservedVenues().catch(() => []),
    ]);

    // Build a lookup of submission_id → business info
    const businessMap = new Map(businesses.map(b => [b.id, b]));

    // Group entries by submission
    const submissionTools: Record<string, { category: string; tool_name: string }[]> = {};
    for (const e of entries) {
      if (!submissionTools[e.submission_id]) submissionTools[e.submission_id] = [];
      submissionTools[e.submission_id].push({ category: e.category, tool_name: e.tool_name });
    }

    // Merge business info with their tools — only include submissions that
    // have at least one meaningful tool entry. Empty submissions (form
    // abandoned or every answer was N/A/None) aren't really "reviews" and
    // were inflating the main dashboard's number vs /analytics.
    const reviews = businesses
      .filter(b => submissionTools[b.id]?.length)
      .map(b => ({
        id: b.id,
        businessName: b.business_name,
        industry: b.industry,
        location: b.location,
        size: b.size,
        numberOfLocations: b.number_of_locations,
        created_at: b.created_at,
        submissionType: b.submission_type,
        tools: submissionTools[b.id],
      })).sort((a, b) => b.created_at.localeCompare(a.created_at));

    // Top tools from analytics view
    const topTools = toolUsage.slice(0, 20).map(t => ({
      name: t.tool_name,
      category: t.category,
      count: t.usage_count,
      uniqueBusinesses: t.unique_businesses,
    }));

    // Venues a field agent has seen (no review yet), labelled as such.
    const fieldObserved = observed.map(v => ({
      id: v.id,
      businessName: v.venue_name,
      industry: 'Hospitality',
      location: v.postcode,
      size: null,
      numberOfLocations: null,
      created_at: v.visited_at,
      submissionType: 'field-observed',
      tools: v.entries.map(e => ({ category: e.category, tool_name: e.tool_name })),
    }));

    // Categories from entries, review and field-observed
    const categoryCounts: Record<string, number> = {};
    for (const e of [...entries, ...observed.flatMap(v => v.entries)]) {
      categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    }
    const categories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => ({ category, count }));

    return NextResponse.json({
      reviews,
      totalReviews: reviews.length,
      fieldObserved,
      totalEntries: entries.length,
      topTools,
      categories,
      posMarketShare: posData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

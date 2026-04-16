import { NextResponse } from 'next/server';
import { getTechStackEntries, getBusinessSubmissions, getToolUsageStats, getPOSMarketShare } from '@/lib/stackcollect';

export async function GET() {
  try {
    const [entries, businesses, toolUsage, posData] = await Promise.all([
      getTechStackEntries(),
      getBusinessSubmissions(),
      getToolUsageStats(),
      getPOSMarketShare(),
    ]);

    // Build a lookup of submission_id → business info
    const businessMap = new Map(businesses.map(b => [b.id, b]));

    // Group entries by submission
    const submissionTools: Record<string, { category: string; tool_name: string }[]> = {};
    for (const e of entries) {
      if (!submissionTools[e.submission_id]) submissionTools[e.submission_id] = [];
      submissionTools[e.submission_id].push({ category: e.category, tool_name: e.tool_name });
    }

    // Merge business info with their tools
    const reviews = businesses.map(b => ({
      id: b.id,
      businessName: b.business_name,
      industry: b.industry,
      location: b.location,
      size: b.size,
      numberOfLocations: b.number_of_locations,
      created_at: b.created_at,
      submissionType: b.submission_type,
      tools: submissionTools[b.id] || [],
    })).sort((a, b) => b.created_at.localeCompare(a.created_at));

    // Top tools from analytics view
    const topTools = toolUsage.slice(0, 20).map(t => ({
      name: t.tool_name,
      category: t.category,
      count: t.usage_count,
      uniqueBusinesses: t.unique_businesses,
    }));

    // Categories from entries
    const categoryCounts: Record<string, number> = {};
    for (const e of entries) {
      categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    }
    const categories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => ({ category, count }));

    return NextResponse.json({
      reviews,
      totalReviews: reviews.length,
      totalEntries: entries.length,
      topTools,
      categories,
      posMarketShare: posData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getTechStackEntries } from '@/lib/stackcollect';

export async function GET() {
  try {
    const entries = await getTechStackEntries();

    // Group by submission to get reviews with timestamps
    const submissions: Record<string, { id: string; created_at: string; tools: { category: string; tool_name: string }[] }> = {};

    for (const e of entries) {
      if (!submissions[e.submission_id]) {
        submissions[e.submission_id] = {
          id: e.submission_id,
          created_at: e.created_at,
          tools: [],
        };
      }
      submissions[e.submission_id].tools.push({
        category: e.category,
        tool_name: e.tool_name,
      });
    }

    const reviews = Object.values(submissions).sort(
      (a, b) => b.created_at.localeCompare(a.created_at)
    );

    // Top tools across all entries
    const toolCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    for (const e of entries) {
      const key = e.tool_name.toLowerCase().trim();
      toolCounts[key] = (toolCounts[key] || 0) + 1;
      categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
    }

    const topTools = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }));

    const categories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => ({ category, count }));

    return NextResponse.json({
      reviews,
      totalReviews: reviews.length,
      totalEntries: entries.length,
      topTools,
      categories,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

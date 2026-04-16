import { NextResponse } from 'next/server';
import { getPartnerList, getMetrics, getMarketingActivities } from '@/lib/airtable';
import { getStackCollectStats } from '@/lib/stackcollect';

export async function GET() {
  try {
    const [partners, metrics, activities, stackStats] = await Promise.all([
      getPartnerList(),
      getMetrics(),
      getMarketingActivities(),
      getStackCollectStats(),
    ]);

    // Lead status breakdown (aggregated across all partners)
    const statusTotals: Record<string, number> = {};
    partners.forEach(p => {
      Object.entries(p.statusBreakdown).forEach(([status, count]) => {
        const key = status.trim();
        statusTotals[key] = (statusTotals[key] || 0) + count;
      });
    });

    const leadStatusData = Object.entries(statusTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({ status, count }));

    // Leads by partner
    const leadsByPartner = partners
      .map(p => ({ name: p.name, leads: p.leadCount }))
      .sort((a, b) => b.leads - a.leads);

    // Traffic over time (sorted by week)
    const trafficData = metrics
      .sort((a, b) => a.weekStarting.localeCompare(b.weekStarting))
      .map(m => ({
        week: m.weekStarting,
        sessions: m.sessions,
        users: m.users,
        pageViews: m.pageViews,
        partner: m.partnerName,
      }));

    // Aggregate traffic by week (sum across partners)
    const weeklyTraffic: Record<string, { sessions: number; users: number; pageViews: number }> = {};
    for (const m of trafficData) {
      if (!weeklyTraffic[m.week]) {
        weeklyTraffic[m.week] = { sessions: 0, users: 0, pageViews: 0 };
      }
      weeklyTraffic[m.week].sessions += m.sessions;
      weeklyTraffic[m.week].users += m.users;
      weeklyTraffic[m.week].pageViews += m.pageViews;
    }

    const trafficOverTime = Object.entries(weeklyTraffic)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week: week.slice(5), // MM-DD format for chart labels
        ...data,
      }));

    // Marketing activity by month
    const monthlyMarketing: Record<string, { impressions: number; engagements: number; count: number }> = {};
    for (const a of activities) {
      const month = a.date ? a.date.slice(0, 7) : 'Unknown'; // YYYY-MM
      if (!monthlyMarketing[month]) {
        monthlyMarketing[month] = { impressions: 0, engagements: 0, count: 0 };
      }
      monthlyMarketing[month].impressions += a.impressions;
      monthlyMarketing[month].engagements += a.engagements;
      monthlyMarketing[month].count++;
    }

    const marketingOverTime = Object.entries(monthlyMarketing)
      .filter(([month]) => month !== 'Unknown')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    // Tech stack - top tools
    const topTools = stackStats.topTools.slice(0, 15).map(t => ({
      name: t.name.charAt(0).toUpperCase() + t.name.slice(1),
      count: t.count,
    }));

    // Tech stack - categories
    const categoryData = Object.entries(stackStats.categories)
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => ({ category, count }));

    return NextResponse.json({
      leadStatusData,
      leadsByPartner,
      trafficOverTime,
      marketingOverTime,
      topTools,
      categoryData,
      summary: {
        totalLeads: partners.reduce((s, p) => s + p.leadCount, 0),
        totalPartners: partners.length,
        totalReviews: stackStats.totalReviews,
        totalToolEntries: stackStats.totalToolEntries,
        totalActivities: activities.length,
        totalImpressions: activities.reduce((s, a) => s + a.impressions, 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getPartnerList } from '@/lib/airtable';
import { getStackCollectStats } from '@/lib/stackcollect';

export async function GET() {
  try {
    const [partners, stackStats] = await Promise.all([
      getPartnerList(),
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
      trafficOverTime: [],
      marketingOverTime: [],
      topTools,
      categoryData,
      summary: {
        totalLeads: partners.reduce((s, p) => s + p.leadCount, 0),
        totalPartners: partners.length,
        totalReviews: stackStats.totalReviews,
        totalToolEntries: stackStats.totalToolEntries,
        totalActivities: 0,
        totalImpressions: 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getPartnerList } from '@/lib/airtable';
import { getStackCollectStats } from '@/lib/stackcollect';

export const dynamic = 'force-dynamic';

const STAGE_FIELDS = {
  MAL:           'fldeqDBBIEBrTCUz7',
  MQL:           'fldwsJvK2OXEMnqZv',
  SQL:           'fldX3oJVfCPqBaB2E',
  'Closed Won':  'fldvWQ5uF7AovgfFo',
  'Closed Lost': 'fld0D3InAxjneoAYe',
} as const;

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const LEADS_TABLE = 'tblUkL8xKL4ZNUFKV';

async function fetchAllLeads() {
  const all: any[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    Object.values(STAGE_FIELDS).forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
      next: { revalidate: 60 },
    });
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

function hasAnyAtStage(record: any, stageFieldId: string): boolean {
  const v = record.fields?.[stageFieldId];
  return Array.isArray(v) && v.length > 0;
}

export async function GET() {
  try {
    const [partners, stackStats, rawLeads] = await Promise.all([
      getPartnerList(),
      getStackCollectStats(),
      fetchAllLeads(),
    ]);

    // Stage counts from raw leads (each lead counted once per stage if any partner is at it).
    // Mirrors the main dashboard logic.
    const statusTotals: Record<string, number> = {};
    for (const stage of Object.keys(STAGE_FIELDS) as (keyof typeof STAGE_FIELDS)[]) {
      const fieldId = STAGE_FIELDS[stage];
      statusTotals[stage] = rawLeads.filter(r => hasAnyAtStage(r, fieldId)).length;
    }

    const leadStatusData = Object.entries(statusTotals)
      .filter(([, c]) => c > 0)
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
        totalLeads: rawLeads.length, // matches dashboard "Total Leads"
        totalPartners: partners.length,
        totalReviews: stackStats.totalReviews,
        totalToolEntries: stackStats.totalToolEntries,
        // Per-stage totals so the page can show MAL/MQL/SQL/Won/Lost cards
        malCount: statusTotals.MAL || 0,
        mqlCount: statusTotals.MQL || 0,
        sqlCount: statusTotals.SQL || 0,
        closedWon: statusTotals['Closed Won'] || 0,
        closedLost: statusTotals['Closed Lost'] || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

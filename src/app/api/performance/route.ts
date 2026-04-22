import { NextResponse } from 'next/server';
import { getPartnerList, getMarketingActivities, getActivitiesForPartner } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const LEADS_TABLE = 'tblUkL8xKL4ZNUFKV';
const LEAD_FIELDS = {
  businessName:    'fldaIprcZqrPGRxen',
  partnerReferral: 'fldwsJvK2OXEMnqZv',
  leadStatus:      'fldf4TNAglyB9s2gP',
  stage:           'fldbNGUCnii13HcIm',
  lastModified:    'fldAqG8dAXFX3bdFd',
};

interface LeadRow {
  partners: string[];
  status: string;
  stage: string;
  lastModified: string;
}

export interface PartnerPerformance {
  name: string;
  slug: string;
  leadCount: number;
  sqlCount: number;
  mqlCount: number;
  demoCount: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
  leadToSqlPct: number;
  sqlToWonPct: number;
  pipelineGbp: number;
  impressions: number;
  engagements: number;
  activityCount: number;
  lastLeadAt: string | null;
  lastActivityAt: string | null;
  daysSinceLastLead: number | null;
  daysSinceLastActivity: number | null;
}

function extractVal(field: unknown): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null && 'name' in field) {
    return String((field as { name: unknown }).name);
  }
  return String(field);
}

function extractMulti(field: unknown): string[] {
  if (!field) return [];
  if (!Array.isArray(field)) return [extractVal(field)];
  return (field as unknown[])
    .map(f => typeof f === 'string' ? f : (f && typeof f === 'object' && 'name' in f ? String((f as { name: unknown }).name) : ''))
    .filter(Boolean);
}

async function fetchAllLeads(): Promise<LeadRow[]> {
  const all: LeadRow[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    Object.values(LEAD_FIELDS).forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
      next: { revalidate: 60 },
    });
    const data = await res.json();
    for (const r of (data.records || [])) {
      const fields = r.fields || {};
      all.push({
        partners: extractMulti(fields[LEAD_FIELDS.partnerReferral]),
        status:   extractVal(fields[LEAD_FIELDS.leadStatus]),
        stage:    extractVal(fields[LEAD_FIELDS.stage]),
        lastModified: fields[LEAD_FIELDS.lastModified] || '',
      });
    }
    offset = data.offset;
  } while (offset);
  return all;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

export async function GET() {
  try {
    const [partners, leads, activities] = await Promise.all([
      getPartnerList(),
      fetchAllLeads(),
      getMarketingActivities(),
    ]);

    const rows: PartnerPerformance[] = partners.map(p => {
      const nameLower = p.name.trim().toLowerCase();
      const partnerLeads = leads.filter(l =>
        l.partners.some(pr => pr.trim().toLowerCase() === nameLower)
      );

      const statusCountLower = (s: string) =>
        partnerLeads.filter(l => l.status.trim().toLowerCase() === s.toLowerCase()).length;
      const stageCountLower = (s: string) =>
        partnerLeads.filter(l => l.stage.trim().toLowerCase() === s.toLowerCase()).length;

      const leadCount = partnerLeads.length;
      const sqlCount  = statusCountLower('SQL');
      const mqlCount  = statusCountLower('MQL');
      const demoCount = statusCountLower('Demo');
      const wonCount  = statusCountLower('Closed Won') + stageCountLower('Closed Won');
      const lostCount = statusCountLower('Lost') + statusCountLower('Closed Lost') + stageCountLower('Closed Lost');
      const activeCount = Math.max(0, leadCount - wonCount - lostCount);

      const partnerActivities = getActivitiesForPartner(activities, p.name);
      const pipelineGbp = partnerActivities.reduce((s, a) => s + (a.pipelineValue || 0), 0);
      const impressions = partnerActivities.reduce((s, a) => s + (a.impressions  || 0), 0);
      const engagements = partnerActivities.reduce((s, a) => s + (a.engagements  || 0), 0);

      const lastLeadAt = partnerLeads
        .map(l => l.lastModified)
        .filter(Boolean)
        .sort()
        .pop() || null;
      const lastActivityAt = partnerActivities
        .map(a => a.date || '')
        .filter(Boolean)
        .sort()
        .pop() || null;

      return {
        name: p.name,
        slug: p.slug,
        leadCount,
        sqlCount,
        mqlCount,
        demoCount,
        wonCount,
        lostCount,
        activeCount,
        leadToSqlPct: pct(sqlCount, leadCount),
        sqlToWonPct:  pct(wonCount, sqlCount),
        pipelineGbp,
        impressions,
        engagements,
        activityCount: partnerActivities.length,
        lastLeadAt,
        lastActivityAt,
        daysSinceLastLead: daysSince(lastLeadAt),
        daysSinceLastActivity: daysSince(lastActivityAt),
      };
    });

    return NextResponse.json({ rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

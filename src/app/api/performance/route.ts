import { NextResponse } from 'next/server';
import {
  getPartnerList,
  getMarketingActivities,
  getActivitiesForPartner,
  fetchPartnerLeadRecords,
  fetchMqlDates,
  buildPartnerDetail,
} from '@/lib/airtable';
import { getAllLeads } from '@/lib/leads';
import { tierForSlug } from '@/lib/partner-package';
import { partnerActivity, type HealthBand } from '@/lib/partner-activity';

export const dynamic = 'force-dynamic';

// Per-partner numbers for the Performance table and the dashboard's Partner
// Health boxes. Lead counts come from buildPartnerDetail — the same code
// behind the internal partner page and the partner's own /p page — so every
// figure here matches what the partner sees. (This route used to read the
// MQL column and the legacy Lead Status field on its own, which is why the
// boxes and the partner pages disagreed.)

export interface PartnerPerformance {
  name: string;
  slug: string;
  tier: string;
  leadCount: number;
  malCount: number;
  mqlCount: number;
  mqlNowCount: number;
  sqlCount: number;
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
  leads14d: number;
  leads30d: number;
  band: HealthBand;
  lastLeadAt: string | null;
  lastActivityAt: string | null;
  daysSinceLastLead: number | null;
  daysSinceLastActivity: number | null;
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
    const [records, activities, allLeads, mqlDates] = await Promise.all([
      fetchPartnerLeadRecords(),
      getMarketingActivities(),
      getAllLeads(),
      fetchMqlDates(),
    ]);
    const partners = await getPartnerList(records);
    const now = Date.now();

    const rows: PartnerPerformance[] = await Promise.all(partners.map(async p => {
      const a = partnerActivity(buildPartnerDetail(records, p.slug, mqlDates), now);

      const partnerActivities = getActivitiesForPartner(activities, p.name);
      const pipelineGbp = partnerActivities.reduce((s, x) => s + (x.pipelineValue || 0), 0);
      const impressions = partnerActivities.reduce((s, x) => s + (x.impressions || 0), 0);
      const engagements = partnerActivities.reduce((s, x) => s + (x.engagements || 0), 0);
      const lastActivityAt = partnerActivities
        .map(x => x.date || '')
        .filter(Boolean)
        .sort()
        .pop() || null;

      return {
        name: p.name,
        slug: p.slug,
        tier: await tierForSlug(p.slug),
        leadCount: a.leadCount,
        malCount: a.malCount,
        mqlCount: a.mqlCount,
        mqlNowCount: a.mqlNowCount,
        sqlCount: a.sqlCount,
        demoCount: 0,
        wonCount: a.wonCount,
        lostCount: a.lostCount,
        activeCount: Math.max(0, a.leadCount - a.wonCount - a.lostCount),
        leadToSqlPct: pct(a.sqlCount, a.leadCount),
        sqlToWonPct: pct(a.wonCount, a.sqlCount),
        pipelineGbp,
        impressions,
        engagements,
        activityCount: partnerActivities.length,
        leads14d: a.leads14d,
        leads30d: a.leads30d,
        band: a.band,
        lastLeadAt: a.lastLeadAt,
        lastActivityAt,
        daysSinceLastLead: a.daysSinceLastLead,
        daysSinceLastActivity: daysSince(lastActivityAt),
      };
    }));

    // Header totals, counted the way the main dashboard counts them: a lead
    // is at a stage if any partner is attached to it there.
    const atStage = (s: 'MQL' | 'SQL' | 'Closed Won') =>
      allLeads.filter(l => (l.stages?.[s]?.length ?? 0) > 0).length;
    const totals = {
      totalLeads: allLeads.length,
      sqlCount: atStage('SQL'),
      mqlCount: atStage('MQL'),
      wonCount: atStage('Closed Won'),
    };

    return NextResponse.json({ rows, totals });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

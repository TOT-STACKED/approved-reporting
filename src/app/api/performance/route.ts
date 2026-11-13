import { NextResponse } from 'next/server';
import {
  getPartnerList,
  getMarketingActivities,
  getActivitiesForPartner,
  fetchPartnerLeadRecords,
  fetchStageEvents,
  buildPartnerDetail,
} from '@/lib/airtable';
import { getAllLeads } from '@/lib/leads';
import { tierForSlug } from '@/lib/partner-package';
import { partnerActivity, POINTS, type HealthBand, type Move, type PartnerActivity } from '@/lib/partner-activity';

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
  points30d: number;
  pointsPrev30d: number;
  sql30d: number;
  won30d: number;
  streakWeeks: number;
  comeback: boolean;
  weekly: number[];
  moves30d: Move[];
}

/** One move in the "latest moves" feed: an Approved partner's lead stepping forward. */
export interface FeedItem extends Move {
  partner: string;
  slug: string;
}

/** Points per Stacked lead owner, from moves on Approved partners' leads. */
export interface TeamScore {
  owner: string;
  points30d: number;
  moves30d: number;
  sql30d: number;
  won30d: number;
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
    const [records, activities, allLeads, stageEvents] = await Promise.all([
      fetchPartnerLeadRecords(),
      getMarketingActivities(),
      getAllLeads(),
      fetchStageEvents(),
    ]);
    const partners = await getPartnerList(records);
    const now = Date.now();
    const activityBySlug = new Map<string, PartnerActivity>();

    const rows: PartnerPerformance[] = await Promise.all(partners.map(async p => {
      const a = partnerActivity(buildPartnerDetail(records, p.slug, stageEvents), now);
      activityBySlug.set(p.slug, a);

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
        points30d: a.points30d,
        pointsPrev30d: a.pointsPrev30d,
        sql30d: a.sql30d,
        won30d: a.won30d,
        streakWeeks: a.streakWeeks,
        comeback: a.comeback,
        weekly: a.weekly,
        moves30d: a.moves30d,
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

    // Latest moves this week, and the team scoreboard, from Approved partners
    // only (the team doesn't source leads for Promote).
    const approved = rows.filter(r => r.tier === 'approved');
    const feed: FeedItem[] = approved
      .flatMap(r => (activityBySlug.get(r.slug)?.recentMoves || []).map(m => ({ ...m, partner: r.name, slug: r.slug })))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    const DAY = 24 * 60 * 60 * 1000;
    const team = new Map<string, TeamScore>();
    for (const r of approved) {
      const detail = buildPartnerDetail(records, r.slug, stageEvents);
      for (const lead of detail?.leads || []) {
        const owner = lead.owner && lead.owner !== 'N/A' ? lead.owner : 'Unassigned';
        for (const m of lead.moves || []) {
          if (m.stage === 'Closed Lost') continue;
          const ts = Date.parse(m.date);
          if (Number.isNaN(ts) || now - ts > 30 * DAY) continue;
          const t = team.get(owner) || { owner, points30d: 0, moves30d: 0, sql30d: 0, won30d: 0 };
          t.points30d += POINTS[m.stage];
          t.moves30d++;
          if (m.stage === 'SQL') t.sql30d++;
          if (m.stage === 'Closed Won') t.won30d++;
          team.set(owner, t);
        }
      }
    }
    const teamScores = Array.from(team.values()).sort((a, b) => b.points30d - a.points30d || a.owner.localeCompare(b.owner));

    return NextResponse.json({ rows, totals, feed, team: teamScores });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Partner Health and the Partner League: how much each partner's pipeline has
// moved lately.
//
// A "move" is any step forward a partner sees on a lead: passed to them as an
// MQL, moved to SQL, or Closed Won. Each is dated when it happened (Stage Log,
// from the Slack alert). So tagging an SQL that was never an MQL, or moving an
// old MQL up to SQL, counts as activity today and lifts the partner out of red.
//
// Counts come from buildPartnerDetail — the same code the internal partner
// page and the partner's own /p page use — so a box on the dashboard always
// agrees with the page it links to.

import type { PartnerDetail, MoveStage } from './airtable';
import { hasReachedMql, reachedMqlCount } from './lead-status';

export type HealthBand = 'green' | 'amber' | 'red';

// Thresholds. Green: a steady flow. Amber: still moving, but thin.
// Red: no move for four weeks or more.
export const GREEN_MIN_MOVES_30D = 3;
/** Same as GREEN_MIN_MOVES_30D; kept for older imports. */
export const GREEN_MIN_LEADS_30D = GREEN_MIN_MOVES_30D;
export const RED_AFTER_DAYS = 28;

// League points per move. Won is worth most because it's the outcome the
// partner pays for; SQL is a real handover; MQL is the start.
export type CountedStage = 'MQL' | 'SQL' | 'Closed Won';
export const POINTS: Record<CountedStage, number> = { MQL: 1, SQL: 3, 'Closed Won': 10 };

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Move {
  stage: CountedStage;
  date: string;
  business: string;
  owner: string;
}

export interface PartnerActivity {
  leadCount: number;
  malCount: number;
  /** Every lead that has reached MQL — matches the MQL card on the partner pages. */
  mqlCount: number;
  /** Leads at MQL right now. */
  mqlNowCount: number;
  sqlCount: number;
  wonCount: number;
  lostCount: number;
  /** Moves (MQL, SQL or Won) in the last 14 / 30 days. */
  leads14d: number;
  leads30d: number;
  /** Date of the latest move. */
  lastLeadAt: string | null;
  daysSinceLastLead: number | null;
  band: HealthBand;
  /** League points from moves in the last 30 days, and the 30 days before. */
  points30d: number;
  pointsPrev30d: number;
  sql30d: number;
  won30d: number;
  /** Consecutive weeks (7-day blocks back from today) with at least one move. */
  streakWeeks: number;
  /** Had nothing for 28+ days until a move in the last 7 days. */
  comeback: boolean;
  /** Moves in the last 7 days, newest first. */
  recentMoves: Move[];
}

export function healthBand(daysSinceLastMove: number | null, moves30d: number): HealthBand {
  if (daysSinceLastMove == null || daysSinceLastMove > RED_AFTER_DAYS) return 'red';
  if (moves30d >= GREEN_MIN_MOVES_30D) return 'green';
  return 'amber';
}

const COUNTED = new Set<MoveStage>(['MQL', 'SQL', 'Closed Won']);

export function partnerActivity(detail: PartnerDetail | null, now = Date.now()): PartnerActivity {
  const sb = detail?.statusBreakdown ?? {};
  const n = (k: string) => (sb[k] || 0) + (sb[`${k} `] || 0);

  // Every move this partner has seen. Only leads at MQL or beyond: every new
  // lead is tagged MAL against ~37 partners at once (Stacked's own
  // prospecting), so MAL isn't a move.
  const moves: (Move & { ts: number })[] = [];
  for (const lead of detail?.leads ?? []) {
    if (!hasReachedMql(lead.status)) continue;
    const owner = lead.owner && lead.owner !== 'N/A' ? lead.owner : 'Unassigned';
    const logged = (lead.moves || []).filter(m => COUNTED.has(m.stage));
    if (logged.length) {
      for (const m of logged) {
        const ts = Date.parse(m.date);
        if (!Number.isNaN(ts)) moves.push({ stage: m.stage as CountedStage, date: m.date, business: lead.businessName, owner, ts });
      }
      continue;
    }
    // Nothing in Stage Log: one move at the lead's current stage, dated when
    // the lead was added.
    const ts = Date.parse(lead.mqlDate || lead.date);
    if (Number.isNaN(ts)) continue;
    const stage: CountedStage = lead.status === 'Closed Won' ? 'Closed Won' : lead.status === 'SQL' ? 'SQL' : 'MQL';
    moves.push({ stage, date: new Date(ts).toISOString(), business: lead.businessName, owner, ts });
  }
  moves.sort((a, b) => b.ts - a.ts);

  const age = (m: { ts: number }) => now - m.ts;
  const within = (days: number) => moves.filter(m => age(m) <= days * DAY_MS);
  const m30 = within(30);
  const prev30 = moves.filter(m => age(m) > 30 * DAY_MS && age(m) <= 60 * DAY_MS);
  const pts = (list: Move[]) => list.reduce((s, m) => s + POINTS[m.stage], 0);

  const lastTs = moves[0]?.ts ?? null;
  const daysSinceLastLead = lastTs == null ? null : Math.max(0, Math.floor((now - lastTs) / DAY_MS));

  let streakWeeks = 0;
  for (let w = 0; w < 52; w++) {
    if (!moves.some(m => age(m) >= w * 7 * DAY_MS && age(m) < (w + 1) * 7 * DAY_MS)) break;
    streakWeeks++;
  }

  // Comeback: something moved this week, and before this week the last move
  // was 28+ days earlier (or there had never been one).
  let comeback = false;
  if (lastTs != null && now - lastTs <= 7 * DAY_MS) {
    const weekStart = now - 7 * DAY_MS;
    const before = moves.find(m => m.ts < weekStart);
    comeback = !before || weekStart - before.ts > RED_AFTER_DAYS * DAY_MS;
  }

  return {
    leadCount: detail?.leadCount ?? 0,
    malCount: n('MAL'),
    mqlCount: reachedMqlCount(sb),
    mqlNowCount: n('MQL'),
    sqlCount: n('SQL'),
    wonCount: n('Closed Won'),
    lostCount: n('Closed Lost'),
    leads14d: within(14).length,
    leads30d: m30.length,
    lastLeadAt: lastTs == null ? null : new Date(lastTs).toISOString(),
    daysSinceLastLead,
    band: healthBand(daysSinceLastLead, m30.length),
    points30d: pts(m30),
    pointsPrev30d: pts(prev30),
    sql30d: m30.filter(m => m.stage === 'SQL').length,
    won30d: m30.filter(m => m.stage === 'Closed Won').length,
    streakWeeks,
    comeback,
    recentMoves: within(7).map(({ ts: _ts, ...m }) => m),
  };
}

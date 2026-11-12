// Partner Health: how much each partner's lead flow has moved lately.
//
// Counts come from buildPartnerDetail — the same code the internal partner
// page and the partner's own /p page use — so a box on the dashboard always
// agrees with the page it links to.

import type { PartnerDetail } from './airtable';
import { hasReachedMql, reachedMqlCount } from './lead-status';

export type HealthBand = 'green' | 'amber' | 'red';

// Thresholds. Green: a steady flow. Amber: still coming in, but thin.
// Red: no new MQL for four weeks or more (changed from 14 days, 12 Nov 2026).
export const GREEN_MIN_LEADS_30D = 3;
export const RED_AFTER_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

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
  leads14d: number;
  leads30d: number;
  /** Date the newest MQL-or-later lead was added (the lead's Date, else when the record was created). */
  lastLeadAt: string | null;
  daysSinceLastLead: number | null;
  band: HealthBand;
}

export function healthBand(daysSinceLastLead: number | null, leads30d: number): HealthBand {
  if (daysSinceLastLead == null || daysSinceLastLead > RED_AFTER_DAYS) return 'red';
  if (leads30d >= GREEN_MIN_LEADS_30D) return 'green';
  return 'amber';
}

export function partnerActivity(detail: PartnerDetail | null, now = Date.now()): PartnerActivity {
  const sb = detail?.statusBreakdown ?? {};
  const n = (k: string) => (sb[k] || 0) + (sb[`${k} `] || 0);

  let leads14d = 0;
  let leads30d = 0;
  let lastTs: number | null = null;
  // Only leads that have reached MQL count towards health. Every new lead is
  // tagged MAL against ~37 partners at once (Stacked's own prospecting), so
  // counting MAL made almost everyone green. MQL onwards is what the partner
  // actually sees as a lead on their own page.
  for (const lead of detail?.leads ?? []) {
    if (!hasReachedMql(lead.status)) continue;
    // When the partner was first told about it (Stage Log: their first MQL or
    // SQL Slack alert), else when the lead was first added. A lead added in May that became an
    // MQL in September counts from September.
    const ts = Date.parse(lead.mqlDate || lead.date);
    if (Number.isNaN(ts)) continue;
    const age = now - ts;
    if (age <= 14 * DAY_MS) leads14d++;
    if (age <= 30 * DAY_MS) leads30d++;
    if (lastTs == null || ts > lastTs) lastTs = ts;
  }

  const daysSinceLastLead = lastTs == null ? null : Math.max(0, Math.floor((now - lastTs) / DAY_MS));

  return {
    leadCount: detail?.leadCount ?? 0,
    malCount: n('MAL'),
    mqlCount: reachedMqlCount(sb),
    mqlNowCount: n('MQL'),
    sqlCount: n('SQL'),
    wonCount: n('Closed Won'),
    lostCount: n('Closed Lost'),
    leads14d,
    leads30d,
    lastLeadAt: lastTs == null ? null : new Date(lastTs).toISOString(),
    daysSinceLastLead,
    band: healthBand(daysSinceLastLead, leads30d),
  };
}

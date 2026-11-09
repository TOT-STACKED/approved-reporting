export type LeadStatusCode = 'MAL' | 'MQL' | 'SQL';

export const LEAD_STATUS_NAME: Record<LeadStatusCode, string> = {
  MAL: 'Marketing Awareness Lead',
  MQL: 'Marketing Qualified Lead',
  SQL: 'Sales Qualified Lead',
};

export const LEAD_STATUS_EXPLAINER: Record<LeadStatusCode, string> = {
  MAL: 'Marketing Awareness Lead — has shown awareness of us (engaged with content, signed up to a list, attended an event) but isn’t sales-ready yet.',
  MQL: 'Marketing Qualified Lead — marketing has qualified them as a genuinely interested fit. Meets criteria for product/size and has shown intent.',
  SQL: 'Sales Qualified Lead — sales has accepted them as ready for outreach. Budget, need and timing look real.',
};

/**
 * Stages a lead can only be at once it has been an MQL. In Airtable a lead
 * keeps its old stage tags as it moves on, but the portal counts each lead at
 * its highest stage only — so "at MQL" on its own drops everyone who has since
 * gone on to SQL, Won or Lost. "All MQLs" means every lead in this set.
 */
const REACHED_MQL_STAGES = new Set(['mql', 'sql', 'closed won', 'closed lost']);

export function hasReachedMql(status: string | undefined): boolean {
  return REACHED_MQL_STAGES.has((status || '').trim().toLowerCase());
}

/** Every lead that has ever been an MQL, from a stage → count breakdown. */
export function reachedMqlCount(breakdown: Record<string, number>): number {
  let n = 0;
  for (const [stage, count] of Object.entries(breakdown)) {
    if (hasReachedMql(stage)) n += count;
  }
  return n;
}

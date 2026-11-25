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

// ---------------------------------------------------------------------------
// Where a lead is NOW.
//
// Airtable keeps a partner in the MQL column after the lead moves on to SQL,
// Won or Lost (the Stage Log and move dates rely on that history). For counts
// and lists, each partner on a lead only counts at its highest stage, so a
// lead that went MQL -> SQL is an SQL, not an MQL and an SQL.
// ---------------------------------------------------------------------------

export const PIPELINE_ORDER = ['MAL', 'MQL', 'SQL', 'Closed Lost', 'Closed Won'] as const;
export type PipelineStage = typeof PIPELINE_ORDER[number];

const partnerKey = (p: string) => (p || '').trim().toLowerCase();

/** Each partner kept only at its highest stage on this lead. */
export function stagesNow(stages: Partial<Record<string, string[] | undefined>> | undefined): Record<PipelineStage, string[]> {
  const highest = new Map<string, { name: string; idx: number }>();
  PIPELINE_ORDER.forEach((stage, idx) => {
    for (const p of stages?.[stage] || []) {
      const k = partnerKey(p);
      if (!k) continue;
      const prev = highest.get(k);
      if (!prev || idx >= prev.idx) highest.set(k, { name: p, idx });
    }
  });
  const out = { MAL: [], MQL: [], SQL: [], 'Closed Lost': [], 'Closed Won': [] } as Record<PipelineStage, string[]>;
  for (const { name, idx } of highest.values()) out[PIPELINE_ORDER[idx]].push(name);
  return out;
}

/** Is any partner on this lead at this stage right now (not moved on)? */
export function isAtStageNow(stages: Partial<Record<string, string[] | undefined>> | undefined, stage: PipelineStage): boolean {
  return stagesNow(stages)[stage].length > 0;
}

/** Stage -> partner names straight from raw Airtable fields (field ids per stage). */
export function rawStages(fields: any, stageFieldIds: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [stage, id] of Object.entries(stageFieldIds)) {
    const v = fields?.[id];
    out[stage] = (Array.isArray(v) ? v : v ? [v] : [])
      .map((x: any) => (typeof x === 'string' ? x : x?.name || ''))
      .filter(Boolean);
  }
  return out;
}

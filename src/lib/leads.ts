// Shared lead fetch. Used by /api/leads (the gated internal endpoint) and
// directly by /api/ask so the AI box never has to HTTP round-trip through a
// proxy-gated route (which would redirect to the login HTML page).

import { isHiddenFromTeam, tagSlug } from './partner-exclusions';
import { fetchStageEvents, latestMoveByLead } from './airtable';
import { bulkWriteSeconds, lastTouched, groupByBusiness } from './last-touched';

const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;

const TABLE = 'tblUkL8xKL4ZNUFKV';

const STAGE_FIELDS = {
  MAL:           'fldeqDBBIEBrTCUz7',
  MQL:           'fldwsJvK2OXEMnqZv',
  SQL:           'fldX3oJVfCPqBaB2E',
  'Closed Won':  'fldvWQ5uF7AovgfFo',
  'Closed Lost': 'fld0D3InAxjneoAYe',
} as const;

const STAGE_ORDER = ['MAL', 'MQL', 'SQL', 'Closed Lost', 'Closed Won'] as const;
type Stage = typeof STAGE_ORDER[number];

const FIELDS = {
  businessName: 'fldaIprcZqrPGRxen',
  source:       'fldMgrGbR7iFwSxij',
  leadOwner:    'fldVDhPPUQuW4OTJY',
  lastModified: 'fldAqG8dAXFX3bdFd',
  size:         'fldwUdKgqSG6E2JZ1',
  location:     'fldTwzHji3JbrvHPU',
  date:         'fldRND3uaiduLQouI',
  contactEmail: 'fldRdQUlKtkwn6eHK',
};

function extractVal(field: any): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (field.name) return field.name;
  return String(field);
}

function extractMulti(field: any): string[] {
  if (!field) return [];
  if (!Array.isArray(field)) return [extractVal(field)];
  return field.map((f: any) => typeof f === 'string' ? f : f.name || '').filter(Boolean);
}

export interface Lead {
  id: string;
  businessName: string;
  partners: string[];
  status: Stage | '';
  stages: Record<Stage, string[]>;
  source: string;
  owner: string;
  lastModified: string;
  /** Other lead records for the same business (a later enquiry, say). */
  alsoAs: string[];
  size: string;
  location: string;
  date: string;
}

export async function getAllLeads(): Promise<Lead[]> {
  const allRecords: any[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    const allFieldIds = [...Object.values(FIELDS), ...Object.values(STAGE_FIELDS)];
    allFieldIds.forEach((f, i) => url.searchParams.set(`fields[${i}]`, f));
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
      // no-store on paginated Airtable fetches: offset tokens are ephemeral,
      // so a mixed-freshness cache (page 1 stale + page 2 fresh, or vice versa)
      // can silently truncate or duplicate. Route handlers are already
      // force-dynamic; the extra Airtable round-trip is sub-second and worth
      // the guaranteed consistency.
      cache: 'no-store',
    });
    const data = await res.json();
    allRecords.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  // These leads feed team views and community-wide totals only, so partners
  // that are removed or on a separate deal are stripped from every stage. A
  // lead that was tagged only to them drops out entirely rather than sitting
  // in the totals as an untagged lead.
  const keep = (field: any) => extractMulti(field).filter(p => !isHiddenFromTeam(tagSlug(p)));
  const hadOnlyHiddenTags = (f: any) => {
    const all = Object.values(STAGE_FIELDS).flatMap(id => extractMulti(f[id]));
    return all.length > 0 && all.every(p => isHiddenFromTeam(tagSlug(p)));
  };

  // When each lead was last really touched: bulk-script stamps ignored (they
  // fall back to the latest Stage Log move), and records for the same
  // business share the latest touch, so a new enquiry revives an old record.
  // See last-touched.ts.
  const bulk = bulkWriteSeconds(allRecords.map((r: any) => r.fields?.[FIELDS.lastModified] || ''));
  const latestMove = bulk.size ? latestMoveByLead(await fetchStageEvents()) : new Map<string, string>();
  const touches = groupByBusiness(allRecords.map((r: any) => {
    const f = r.fields || {};
    return {
      id: r.id,
      name: f[FIELDS.businessName] || '',
      email: f[FIELDS.contactEmail] || '',
      touched: lastTouched(f[FIELDS.lastModified] || '', bulk, [latestMove.get(r.id), f[FIELDS.date], r.createdTime]),
    };
  }));

  return allRecords.filter((r: any) => !hadOnlyHiddenTags(r.fields || {})).map((r: any): Lead => {
    const f = r.fields || {};

    const stages: Record<Stage, string[]> = {
      MAL:          keep(f[STAGE_FIELDS.MAL]),
      MQL:          keep(f[STAGE_FIELDS.MQL]),
      SQL:          keep(f[STAGE_FIELDS.SQL]),
      'Closed Won': keep(f[STAGE_FIELDS['Closed Won']]),
      'Closed Lost':keep(f[STAGE_FIELDS['Closed Lost']]),
    };

    let currentStage: Stage | '' = '';
    for (const stage of STAGE_ORDER) {
      if (stages[stage].length > 0) currentStage = stage;
    }

    const partnerSet = new Set<string>();
    for (const stage of STAGE_ORDER) {
      for (const p of stages[stage]) partnerSet.add(p);
    }

    return {
      id: r.id,
      businessName: f[FIELDS.businessName] || '',
      partners: Array.from(partnerSet),
      status: currentStage,
      stages,
      source: extractVal(f[FIELDS.source]),
      owner: extractVal(f[FIELDS.leadOwner]),
      lastModified: touches.get(r.id)?.touched ?? (f[FIELDS.lastModified] || ''),
      alsoAs: touches.get(r.id)?.otherNames ?? [],
      size: f[FIELDS.size] || '',
      location: f[FIELDS.location] || '',
      // Fall back to Airtable's auto-populated record createdTime when the
      // user-entered Date field is empty, so the dashboard always shows
      // *some* date for a lead (and the stale-vs-fresh signal isn't blank).
      date: f[FIELDS.date] || r.createdTime || '',
    };
  });
}

// Community-wide pipeline totals: how many leads sit at each stage across
// every partner, counted the way the main dashboard counts them — a lead is
// at a stage if any partner is attached to it there.
//
// This is what a Promote partner sees in place of their own numbers. Their
// own pipeline is the wrong figure to show them: they aren't being sent
// leads, so it reads as zeros against their name rather than as the scale of
// what Approved would put in front of them.
export interface CommunityPipeline {
  mal: number;
  mql: number;
  sql: number;
  closedWon: number;
  total: number;
}

export async function getCommunityPipeline(): Promise<CommunityPipeline> {
  const leads = await getAllLeads();
  const atStage = (stage: Stage) =>
    leads.filter(l => (l.stages?.[stage]?.length ?? 0) > 0).length;

  return {
    mal: atStage('MAL'),
    mql: atStage('MQL'),
    sql: atStage('SQL'),
    closedWon: atStage('Closed Won'),
    total: leads.length,
  };
}

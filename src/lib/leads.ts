// Shared lead fetch. Used by /api/leads (the gated internal endpoint) and
// directly by /api/ask so the AI box never has to HTTP round-trip through a
// proxy-gated route (which would redirect to the login HTML page).

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

  return allRecords.map((r: any): Lead => {
    const f = r.fields || {};

    const stages: Record<Stage, string[]> = {
      MAL:          extractMulti(f[STAGE_FIELDS.MAL]),
      MQL:          extractMulti(f[STAGE_FIELDS.MQL]),
      SQL:          extractMulti(f[STAGE_FIELDS.SQL]),
      'Closed Won': extractMulti(f[STAGE_FIELDS['Closed Won']]),
      'Closed Lost':extractMulti(f[STAGE_FIELDS['Closed Lost']]),
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
      lastModified: f[FIELDS.lastModified] || '',
      size: f[FIELDS.size] || '',
      location: f[FIELDS.location] || '',
      // Fall back to Airtable's auto-populated record createdTime when the
      // user-entered Date field is empty, so the dashboard always shows
      // *some* date for a lead (and the stale-vs-fresh signal isn't blank).
      date: f[FIELDS.date] || r.createdTime || '',
    };
  });
}

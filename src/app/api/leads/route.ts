import { NextResponse } from 'next/server';

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

export async function GET() {
  try {
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
        next: { revalidate: 60 },
      });
      const data = await res.json();
      allRecords.push(...(data.records || []));
      offset = data.offset;
    } while (offset);

    const leads = allRecords.map((r: any) => {
      const f = r.fields || {};

      // Per-stage partner lists
      const stages: Record<Stage, string[]> = {
        MAL:          extractMulti(f[STAGE_FIELDS.MAL]),
        MQL:          extractMulti(f[STAGE_FIELDS.MQL]),
        SQL:          extractMulti(f[STAGE_FIELDS.SQL]),
        'Closed Won': extractMulti(f[STAGE_FIELDS['Closed Won']]),
        'Closed Lost':extractMulti(f[STAGE_FIELDS['Closed Lost']]),
      };

      // Determine the lead's overall current stage (highest across any partner)
      let currentStage: Stage | '' = '';
      for (const stage of STAGE_ORDER) {
        if (stages[stage].length > 0) currentStage = stage;
      }

      // All partners associated with this lead (any stage)
      const partnerSet = new Set<string>();
      for (const stage of STAGE_ORDER) {
        for (const p of stages[stage]) partnerSet.add(p);
      }

      return {
        id: r.id,
        businessName: f[FIELDS.businessName] || '',
        partners: Array.from(partnerSet),
        status: currentStage, // overall current stage
        stages,               // per-stage partner lists
        source: extractVal(f[FIELDS.source]),
        owner: extractVal(f[FIELDS.leadOwner]),
        lastModified: f[FIELDS.lastModified] || '',
        size: f[FIELDS.size] || '',
        location: f[FIELDS.location] || '',
        date: f[FIELDS.date] || '',
      };
    });

    return NextResponse.json({ leads, total: leads.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

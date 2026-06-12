const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const TABLES = {
  masterView: 'tblUkL8xKL4ZNUFKV',
  partnerPages: 'tblHtBcEu0GWNk9lU',
  partnerMetrics: 'tblotAHqTQ1h6WlcA',
  slackData: 'tbljpVFH4rhrtaOoO',
  supplierFeedback: 'tblPKK0x9fnhlTN3b',
  weeklySpread: 'tblq7oZa1B5n6wktP',
  marketingActivity: 'tblN0KgGlA3bjPlnd',
};

// Stage fields are MULTI-SELECTS containing partner names. A single lead can
// be at different stages for different partners (e.g. SQL for Lightspeed,
// MAL for Square). Highest-stage-wins when computing the lead's "current
// status" for a given partner.
const STAGE_FIELDS = {
  MAL:           'fldeqDBBIEBrTCUz7',
  MQL:           'fldwsJvK2OXEMnqZv',
  SQL:           'fldX3oJVfCPqBaB2E',
  'Closed Won':  'fldvWQ5uF7AovgfFo',
  'Closed Lost': 'fld0D3InAxjneoAYe',
} as const;

// Order from earliest to latest pipeline stage. Used to determine a lead's
// current status for a given partner — later stages override earlier.
const STAGE_ORDER = ['MAL', 'MQL', 'SQL', 'Closed Lost', 'Closed Won'] as const;
type Stage = typeof STAGE_ORDER[number];

const FIELDS = {
  masterView: {
    businessName: 'fldaIprcZqrPGRxen',
    leadStatus: 'fldf4TNAglyB9s2gP', // legacy — kept temporarily for fallback
    source: 'fldMgrGbR7iFwSxij',
    leadOwner: 'fldVDhPPUQuW4OTJY',
    stage: 'fldbNGUCnii13HcIm',
    lastModified: 'fldAqG8dAXFX3bdFd',
    size: 'fldwUdKgqSG6E2JZ1',
    location: 'fldTwzHji3JbrvHPU',
    date: 'fldRND3uaiduLQouI',
  },
  partnerMetrics: {
    partnerName: 'fldriMb2tvbkFVdU3',
    weekStarting: 'fldTSgVYZrmDzm0rf',
    sessions: 'fld8alYKpCw39XNdO',
    users: 'fldLkzHmCogd1J0hL',
    pageViews: 'fld6AbGP7zuusTAeK',
    bounceRate: 'fldSlrwqHQ0dNEpIg',
  },
  slackData: {
    partner: 'fldeZnbjQq04Wbjcj',
    channelId: 'fldylxILkUIZHJrIN',
  },
  weeklySpread: {
    editionTitle: 'fld6x2zYDydTSp5wI',
    weekStarting: 'fldnD95ST5FCoMHjK',
    summary: 'fld6prjJMRld3ejtt',
    keyHighlights: 'fldSsJhoHESYWpWTY',
    linkedinUrl: 'flds0SGyxOSKpYkus',
    author: 'fldwoPeEUvp7ZhCRl',
  },
  marketingActivity: {
    activityTitle: 'fldl4Ag6BUdWti0vJ',
    activityType: 'fldKjiEvBleYLBiDR',
    date: 'fldC4ZH0M4Qnm5qos',
    partnersFeatured: 'fldMcsiw2fcG8NRj6',
    impressions: 'fldv1NTK6HZWjg1hH',
    engagements: 'fldFKBnFwd4fhzSh7',
    clickThroughs: 'fldLUlzHi8yCH7ffK',
    leadsGenerated: 'fldBsoOukGuKRicLY',
    pipelineValue: 'fld8cuyMjmxnqHSL1',
    url: 'fldJ7zsj94vxzRSn5',
    notes: 'flduZmkBDperlVt3Z',
  },
};

async function airtableFetch(tableId: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}/${tableId}`);
  url.searchParams.set('returnFieldsByFieldId', 'true');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${API_KEY}` },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Airtable error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function fetchAllRecords(tableId: string, fields: string[], filterFormula?: string) {
  const allRecords: any[] = [];
  let offset: string | undefined;

  do {
    const params: Record<string, string> = {};
    fields.forEach((f, i) => { params[`fields[${i}]`] = f; });
    if (filterFormula) params['filterByFormula'] = filterFormula;
    if (offset) params['offset'] = offset;
    params['pageSize'] = '100';

    const data = await airtableFetch(tableId, params);
    allRecords.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return allRecords;
}

function normalizePartnerName(name: string): string {
  return name.trim().toLowerCase();
}

export interface Partner {
  name: string;
  slug: string;
  leadCount: number;
  statusBreakdown: Record<string, number>;
}

export interface PartnerDetail extends Partner {
  leads: Lead[];
  stageBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, number>;
  ownerBreakdown: Record<string, number>;
  recentLeads: Lead[];
}

export interface Lead {
  id: string;
  businessName: string;
  status: string;
  source: string;
  owner: string;
  stage: string;
  lastModified: string;
  size: string;
  location: string;
  date: string;
}

export interface MetricsEntry {
  id?: string;
  partnerName: string;
  weekStarting: string;
  sessions: number;
  users: number;
  pageViews: number;
  bounceRate: number;
}

function extractValue(field: any): string {
  if (!field) return 'N/A';
  if (typeof field === 'string') return field;
  if (field.name) return field.name;
  return String(field);
}

function extractMultiValues(field: any): string[] {
  if (!field) return [];
  if (!Array.isArray(field)) return [extractValue(field)];
  return field.map((f: any) => (typeof f === 'string' ? f : f.name || '').trim()).filter(Boolean);
}

// Returns the highest-priority stage a partner appears in for this record's stage fields.
// Returns null if the partner doesn't appear in any stage field.
function getPartnerStage(fields: any, partnerName: string): Stage | null {
  const target = normalizePartnerName(partnerName);
  let highest: Stage | null = null;
  let highestIdx = -1;
  for (const stage of STAGE_ORDER) {
    const partnersAtStage = extractMultiValues(fields[STAGE_FIELDS[stage]]);
    if (partnersAtStage.some(p => normalizePartnerName(p) === target)) {
      const idx = STAGE_ORDER.indexOf(stage);
      if (idx > highestIdx) {
        highest = stage;
        highestIdx = idx;
      }
    }
  }
  return highest;
}

// Returns all { partner -> highest stage } pairs for a given record.
function getRecordPartnerStages(fields: any): Map<string, { name: string; stage: Stage }> {
  const result = new Map<string, { name: string; stage: Stage }>();
  for (const stage of STAGE_ORDER) {
    const partners = extractMultiValues(fields[STAGE_FIELDS[stage]]);
    for (const p of partners) {
      const key = normalizePartnerName(p);
      const existing = result.get(key);
      const existingIdx = existing ? STAGE_ORDER.indexOf(existing.stage) : -1;
      const newIdx = STAGE_ORDER.indexOf(stage);
      if (newIdx > existingIdx) {
        result.set(key, { name: p.trim(), stage });
      }
    }
  }
  return result;
}

export async function getPartnerList(): Promise<Partner[]> {
  const records = await fetchAllRecords(
    TABLES.masterView,
    [
      FIELDS.masterView.businessName,
      ...Object.values(STAGE_FIELDS),
    ]
  );

  const partnerMap = new Map<string, { name: string; count: number; statuses: Record<string, number> }>();

  for (const r of records) {
    const fields = r.fields || {};
    const partnerStages = getRecordPartnerStages(fields);

    for (const [key, { name, stage }] of partnerStages) {
      if (!partnerMap.has(key)) {
        partnerMap.set(key, { name, count: 0, statuses: {} });
      }
      const entry = partnerMap.get(key)!;
      entry.count++;
      entry.statuses[stage] = (entry.statuses[stage] || 0) + 1;
    }
  }

  return Array.from(partnerMap.entries())
    .map(([key, data]) => ({
      name: data.name,
      slug: key.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
      leadCount: data.count,
      statusBreakdown: data.statuses,
    }))
    .sort((a, b) => b.leadCount - a.leadCount);
}

// Parent-company groupings. A request for the parent slug pulls in leads
// tagged with any of the sub-brand names too, and the page renders as the
// parent regardless of which sub-brand the first matched lead happened to
// use. Add a new entry here when a partner acquires/owns another partner.
interface PartnerAliasGroup {
  displayName: string;
  slugs: string[]; // accepted partner-name slugs (lowercase + hyphens)
}
const PARTNER_ALIAS_GROUPS: Record<string, PartnerAliasGroup> = {
  clearcourse: {
    displayName: 'Clearcourse',
    slugs: ['clearcourse', 'tissl', 'giftpro', 'rezcontrol'],
  },
};

export async function getPartnerDetail(slug: string): Promise<PartnerDetail | null> {
  const records = await fetchAllRecords(
    TABLES.masterView,
    [
      ...Object.values(FIELDS.masterView),
      ...Object.values(STAGE_FIELDS),
    ]
  );

  // Resolve the requested slug to its accepted partner-name slugs. For a
  // standalone partner (no alias group), this is just the slug itself.
  const aliasGroup = PARTNER_ALIAS_GROUPS[slug];
  const acceptedSlugs = new Set(aliasGroup ? aliasGroup.slugs : [slug]);

  const partnerLeads: Lead[] = [];
  let partnerName: string | null = null;

  for (const r of records) {
    const fields = r.fields || {};
    const stage = getPartnerStage(fields, slug.replace(/-/g, ' '));

    // Try matching by slug — derive partner name from any of the stage fields
    let matchedName: string | null = null;
    for (const s of STAGE_ORDER) {
      const partners = extractMultiValues(fields[STAGE_FIELDS[s]]);
      const match = partners.find(p => {
        const partnerSlug = normalizePartnerName(p).replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        return acceptedSlugs.has(partnerSlug);
      });
      if (match) {
        matchedName = match.trim();
        break;
      }
    }

    if (!matchedName) continue;

    if (!partnerName) partnerName = matchedName;

    // Compute the lead's current stage for this specific partner
    const leadStageForPartner = getPartnerStage(fields, matchedName);

    partnerLeads.push({
      id: r.id,
      businessName: fields[FIELDS.masterView.businessName] || 'Unknown',
      // status now reflects the lead's stage for THIS partner specifically
      status: leadStageForPartner || extractValue(fields[FIELDS.masterView.leadStatus]),
      source: extractValue(fields[FIELDS.masterView.source]),
      owner: extractValue(fields[FIELDS.masterView.leadOwner]),
      stage: leadStageForPartner || extractValue(fields[FIELDS.masterView.stage]),
      lastModified: fields[FIELDS.masterView.lastModified] || '',
      size: fields[FIELDS.masterView.size] || '',
      location: fields[FIELDS.masterView.location] || '',
      date: fields[FIELDS.masterView.date] || '',
    });
    void stage;
  }

  if (partnerLeads.length === 0) return null;

  const statusBreakdown: Record<string, number> = {};
  const stageBreakdown: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};
  const ownerBreakdown: Record<string, number> = {};

  for (const lead of partnerLeads) {
    statusBreakdown[lead.status] = (statusBreakdown[lead.status] || 0) + 1;
    if (lead.stage !== 'N/A') stageBreakdown[lead.stage] = (stageBreakdown[lead.stage] || 0) + 1;
    if (lead.source !== 'N/A') sourceBreakdown[lead.source] = (sourceBreakdown[lead.source] || 0) + 1;
    if (lead.owner !== 'N/A') ownerBreakdown[lead.owner] = (ownerBreakdown[lead.owner] || 0) + 1;
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recentLeads = partnerLeads
    .filter(l => l.lastModified >= ninetyDaysAgo)
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));

  return {
    // For an alias group, always render the parent's display name even if the
    // first matched lead was tagged with a sub-brand.
    name: aliasGroup?.displayName || partnerName || slug,
    slug,
    leadCount: partnerLeads.length,
    statusBreakdown,
    stageBreakdown,
    sourceBreakdown,
    ownerBreakdown,
    leads: partnerLeads,
    recentLeads,
  };
}

// --- Weekly Spread ---

export interface SpreadEntry {
  id?: string;
  editionTitle: string;
  weekStarting: string;
  summary: string;
  keyHighlights: string;
  linkedinUrl: string;
  author: string;
}

export async function getSpreads(): Promise<SpreadEntry[]> {
  const records = await fetchAllRecords(
    TABLES.weeklySpread,
    Object.values(FIELDS.weeklySpread)
  );

  return records
    .map((r: any) => ({
      id: r.id,
      editionTitle: r.fields?.[FIELDS.weeklySpread.editionTitle] || '',
      weekStarting: r.fields?.[FIELDS.weeklySpread.weekStarting] || '',
      summary: r.fields?.[FIELDS.weeklySpread.summary] || '',
      keyHighlights: r.fields?.[FIELDS.weeklySpread.keyHighlights] || '',
      linkedinUrl: r.fields?.[FIELDS.weeklySpread.linkedinUrl] || '',
      author: r.fields?.[FIELDS.weeklySpread.author] || '',
    }))
    .sort((a, b) => b.weekStarting.localeCompare(a.weekStarting));
}

export async function getLatestSpread(): Promise<SpreadEntry | null> {
  const spreads = await getSpreads();
  return spreads.length > 0 ? spreads[0] : null;
}

export async function writeSpread(entry: Omit<SpreadEntry, 'id'>): Promise<void> {
  const res = await fetch(`${BASE_URL}/${TABLES.weeklySpread}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [
        {
          fields: {
            [FIELDS.weeklySpread.editionTitle]: entry.editionTitle,
            [FIELDS.weeklySpread.weekStarting]: entry.weekStarting,
            [FIELDS.weeklySpread.summary]: entry.summary,
            [FIELDS.weeklySpread.keyHighlights]: entry.keyHighlights,
            [FIELDS.weeklySpread.linkedinUrl]: entry.linkedinUrl,
            [FIELDS.weeklySpread.author]: entry.author,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to write spread: ${res.status} ${await res.text()}`);
  }
}

// --- Marketing Activity ---

export interface MarketingActivity {
  id?: string;
  activityTitle: string;
  activityType: string;
  date: string;
  partnersFeatured: string;
  impressions: number;
  engagements: number;
  clickThroughs: number;
  leadsGenerated: number;
  pipelineValue: number;
  url: string;
  notes: string;
}

export async function getMarketingActivities(): Promise<MarketingActivity[]> {
  // Marketing activity logging has been removed. Return empty array so
  // any callers (reports, analytics, AI context) keep working without it.
  return [];
}

export function getActivitiesForPartner(activities: MarketingActivity[], partnerName: string): MarketingActivity[] {
  const lower = partnerName.trim().toLowerCase();
  return activities.filter(a =>
    a.partnersFeatured.toLowerCase().includes(lower)
  );
}

export async function writeMarketingActivity(entry: Omit<MarketingActivity, 'id'>): Promise<void> {
  const res = await fetch(`${BASE_URL}/${TABLES.marketingActivity}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [
        {
          fields: {
            [FIELDS.marketingActivity.activityTitle]: entry.activityTitle,
            [FIELDS.marketingActivity.activityType]: entry.activityType,
            [FIELDS.marketingActivity.date]: entry.date,
            [FIELDS.marketingActivity.partnersFeatured]: entry.partnersFeatured,
            [FIELDS.marketingActivity.impressions]: entry.impressions,
            [FIELDS.marketingActivity.engagements]: entry.engagements,
            [FIELDS.marketingActivity.clickThroughs]: entry.clickThroughs,
            [FIELDS.marketingActivity.leadsGenerated]: entry.leadsGenerated,
            [FIELDS.marketingActivity.pipelineValue]: entry.pipelineValue,
            [FIELDS.marketingActivity.url]: entry.url,
            [FIELDS.marketingActivity.notes]: entry.notes,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to write activity: ${res.status} ${await res.text()}`);
  }
}

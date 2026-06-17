const SUPABASE_URL = process.env.STACKCOLLECT_SUPABASE_URL!;
const SUPABASE_KEY = process.env.STACKCOLLECT_SUPABASE_KEY!;

async function supabaseFetch(table: string, params: string = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) return [];
  return res.json();
}

async function supabaseFetchAll(table: string, params: string = '') {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const separator = params ? '&' : '';
    const batch = await supabaseFetch(
      table,
      `${params}${separator}limit=${pageSize}&offset=${offset}`
    );
    allRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
}

// --- WhatsApp answers (mirrored into business_submissions by the
// techstackreview slack-notify edge function). The source-of-truth column
// lives on the techstackreview project's `submissions` table, but it gets
// copied into `business_submissions.uses_whatsapp` at insert time so the
// portal only ever needs one Supabase connection.

export interface WhatsAppResponse {
  id: string;
  created_at: string;
  uses_whatsapp: boolean;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  location: string | null;
  numberOfLocations: string | null;
  vertical: string | null;
  industry: string | null;
}

export interface WhatsAppSummary {
  yes: WhatsAppResponse[];
  no: WhatsAppResponse[];
  yesCount: number;
  noCount: number;
  totalAnswered: number;
}

export async function getWhatsappResponses(): Promise<WhatsAppSummary> {
  const rows: any[] = await supabaseFetchAll(
    'business_submissions',
    'select=id,created_at,uses_whatsapp,business_name,contact_name,contact_email,phone_number,location,number_of_locations,vertical,industry&uses_whatsapp=not.is.null&order=created_at.desc'
  );

  const yes: WhatsAppResponse[] = [];
  const no: WhatsAppResponse[] = [];
  for (const r of rows) {
    if (isTestSubmission(r.business_name)) continue;
    const v: WhatsAppResponse = {
      id: r.id,
      created_at: r.created_at,
      uses_whatsapp: r.uses_whatsapp === true,
      businessName: r.business_name ?? '',
      contactName: r.contact_name ?? null,
      contactEmail: r.contact_email ?? null,
      phoneNumber: r.phone_number ?? null,
      location: r.location ?? null,
      numberOfLocations: r.number_of_locations ?? null,
      vertical: r.vertical ?? null,
      industry: r.industry ?? null,
    };
    (r.uses_whatsapp === true ? yes : no).push(v);
  }
  return {
    yes,
    no,
    yesCount: yes.length,
    noCount: no.length,
    totalAnswered: yes.length + no.length,
  };
}

// --- Knowledge Base answers — same shape as WhatsApp, reads from
// business_submissions.has_knowledge_base. Used by the Tech Check Insights
// panel so we can spot venues that don't have a knowledge base and pitch
// the right partner.

export interface KnowledgeBaseResponse {
  id: string;
  created_at: string;
  has_knowledge_base: boolean;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  location: string | null;
  numberOfLocations: string | null;
  vertical: string | null;
  industry: string | null;
}

export interface KnowledgeBaseSummary {
  yes: KnowledgeBaseResponse[];
  no: KnowledgeBaseResponse[];
  yesCount: number;
  noCount: number;
  totalAnswered: number;
}

export async function getKnowledgeBaseResponses(): Promise<KnowledgeBaseSummary> {
  const rows: any[] = await supabaseFetchAll(
    'business_submissions',
    'select=id,created_at,has_knowledge_base,business_name,contact_name,contact_email,phone_number,location,number_of_locations,vertical,industry&has_knowledge_base=not.is.null&order=created_at.desc'
  );

  const yes: KnowledgeBaseResponse[] = [];
  const no: KnowledgeBaseResponse[] = [];
  for (const r of rows) {
    if (isTestSubmission(r.business_name)) continue;
    const v: KnowledgeBaseResponse = {
      id: r.id,
      created_at: r.created_at,
      has_knowledge_base: r.has_knowledge_base === true,
      businessName: r.business_name ?? '',
      contactName: r.contact_name ?? null,
      contactEmail: r.contact_email ?? null,
      phoneNumber: r.phone_number ?? null,
      location: r.location ?? null,
      numberOfLocations: r.number_of_locations ?? null,
      vertical: r.vertical ?? null,
      industry: r.industry ?? null,
    };
    (r.has_knowledge_base === true ? yes : no).push(v);
  }
  return {
    yes,
    no,
    yesCount: yes.length,
    noCount: no.length,
    totalAnswered: yes.length + no.length,
  };
}

// --- Types ---

export interface TechStackEntry {
  id: string;
  submission_id: string;
  category: string;
  tool_name: string;
  created_at: string;
}

export interface BusinessSubmission {
  id: string;
  business_name: string;
  industry: string;
  size: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string;
  role: string | null;
  created_at: string;
  phone_number: string | null;
  number_of_locations: string | null;
  biggest_challenge: string | null;
  vertical: string | null;
  submission_type: string;
}

export interface ToolUsageStat {
  tool_name: string;
  category: string;
  usage_count: number;
  unique_businesses: number;
}

export interface POSMarketShare {
  tool_name: string;
  usage_count: number;
  unique_businesses: number;
  market_share_percentage: number;
}

export interface StackCollectStats {
  totalReviews: number;
  totalToolEntries: number;
  partnerMentions: number;
  categories: Record<string, number>;
  topTools: { name: string; count: number }[];
  partnerToolData: { category: string; tool_name: string; count: number }[];
}

export interface NpsScore {
  id: string;
  created_at: string;
  source: 'techstackreview' | 'toast-support-bot';
  touchpoint: string | null;
  score: number;
  comment: string | null;
  vendor: string | null;
  category: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  company: string | null;
  venue_id: string | null;
  external_id: string | null;
  meta: Record<string, unknown>;
}

export interface NpsVendorRollup {
  vendor: string;
  nps: number;          // -100..100
  avg: number;          // average score 0..10
  count: number;
  promoters: number;
  passives: number;
  detractors: number;
}

// --- Fetch functions ---

// Pattern matches to exclude test submissions
const TEST_PATTERNS = [
  /\btest\b/i,
  /\bqa\b/i,
  /\bprobe\b/i,
  /^copy\s/i,
  /stackreview/i,
  /portal\s*link/i,
  /^tot$/i,
  /sync\s*test/i,
  /phone\/lastname/i,
  /^ss$/i,
  /^hfdhdhdfhdf/i,
  /^14652073$/,
];

function isTestSubmission(businessName: string | null | undefined): boolean {
  if (!businessName) return false;
  return TEST_PATTERNS.some(p => p.test(businessName));
}

export async function getBusinessSubmissions(): Promise<BusinessSubmission[]> {
  const all = await supabaseFetchAll('business_submissions', 'select=*&order=created_at.desc');
  // Filter out test submissions
  return all.filter(b => !isTestSubmission(b.business_name));
}

// Tool names we never want to surface in the portal — placeholder/empty
// values that pollute the rankings.
const NA_TOOL_PATTERN = /^(n\/?a|none|null|n\.a\.?|—|-|other)$/i;

function isMeaningfulTool(toolName: string | null | undefined): boolean {
  if (!toolName) return false;
  const t = toolName.trim();
  if (!t) return false;
  return !NA_TOOL_PATTERN.test(t);
}

export async function getTechStackEntries(): Promise<TechStackEntry[]> {
  const [entries, validBusinesses] = await Promise.all([
    supabaseFetchAll('tech_stack_entries', 'select=*&order=created_at.desc'),
    getBusinessSubmissions(),
  ]);

  // Only include entries whose submission_id matches a non-test business AND
  // whose tool_name isn't a placeholder like N/A.
  const validIds = new Set(validBusinesses.map(b => b.id));
  return entries.filter(e =>
    validIds.has(e.submission_id) && isMeaningfulTool(e.tool_name)
  );
}

export async function getToolUsageStats(): Promise<ToolUsageStat[]> {
  const all = await supabaseFetchAll('analytics_tool_usage', 'select=*&order=usage_count.desc');
  return all.filter((t: ToolUsageStat) => isMeaningfulTool(t.tool_name));
}

export async function getPOSMarketShare(): Promise<POSMarketShare[]> {
  return supabaseFetchAll('analytics_pos_systems', 'select=*&order=market_share_percentage.desc');
}

export async function getNpsScores(params: { source?: NpsScore['source']; limit?: number } = {}): Promise<NpsScore[]> {
  const qs: string[] = ['select=*', 'order=created_at.desc'];
  if (params.source) qs.push(`source=eq.${params.source}`);

  // NPS lands in near real-time — bypass the 5-min supabaseFetch cache so
  // the dashboard picks up submissions as they arrive.
  const rows: NpsScore[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/nps_scores?${qs.join('&')}&limit=${pageSize}&offset=${offset}`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) break;
    const batch: NpsScore[] = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  // Strip test entries by company name so dashboards aren't polluted.
  const cleaned = rows.filter(s => !isTestSubmission(s.company));
  return typeof params.limit === 'number' ? cleaned.slice(0, params.limit) : cleaned;
}

// Roll scores up per vendor into NPS (%promoters − %detractors × 100).
// Grouping is case/whitespace-insensitive so "Dojo", "dojo" and "DOJO " all
// fold into one vendor. The display name uses the most common original casing.
export function rollupNpsByVendor(scores: NpsScore[]): NpsVendorRollup[] {
  const byVendor = new Map<string, { casings: Map<string, number>; scores: number[] }>();
  for (const s of scores) {
    const raw = (s.vendor ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!byVendor.has(key)) byVendor.set(key, { casings: new Map(), scores: [] });
    const entry = byVendor.get(key)!;
    entry.scores.push(s.score);
    entry.casings.set(raw, (entry.casings.get(raw) || 0) + 1);
  }
  return Array.from(byVendor.values())
    .map(({ casings, scores: arr }) => {
      // Pick the most frequently seen original casing as the display name.
      const vendor = Array.from(casings.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const promoters  = arr.filter(s => s >= 9).length;
      const passives   = arr.filter(s => s === 7 || s === 8).length;
      const detractors = arr.filter(s => s <= 6).length;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const nps = Math.round(((promoters - detractors) / arr.length) * 100);
      return { vendor, nps, avg: Number(avg.toFixed(1)), count: arr.length, promoters, passives, detractors };
    })
    .sort((a, b) => b.nps - a.nps);
}

// --- Aggregation functions ---

export async function getStackCollectStats(): Promise<StackCollectStats> {
  const entries: TechStackEntry[] = await getTechStackEntries();

  const categories: Record<string, number> = {};
  const tools: Record<string, number> = {};
  const submissions = new Set<string>();

  for (const e of entries) {
    categories[e.category] = (categories[e.category] || 0) + 1;
    const toolLower = e.tool_name.toLowerCase().trim();
    tools[toolLower] = (tools[toolLower] || 0) + 1;
    submissions.add(e.submission_id);
  }

  const topTools = Object.entries(tools)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  return {
    totalReviews: submissions.size,
    totalToolEntries: entries.length,
    partnerMentions: 0,
    categories,
    topTools,
    partnerToolData: [],
  };
}

// Maps a partner's display name (lowercased) to the tool_name/vendor terms
// used across tech_stack_entries and nps_scores. Shared between the stack
// breakdown and the NPS rollup so partner pages stay in sync.
export const PARTNER_VENDOR_ALIASES: Record<string, string[]> = {
  'sky': ['sky'],
  'workforce': ['workforce'],
  'bizimply': ['bizimply'],
  'square': ['square'],
  'sona': ['sona'],
  'lightspeed': ['lightspeed'],
  'nory': ['nory'],
  'cinchio': ['cinchio'],
  'wrs': ['wrs'],
  'urocked': ['urocked'],
  'deputy': ['deputy'],
  'stampede': ['stampede'],
  'tayl': ['tayl'],
  'tenzo': ['tenzo'],
  'apicbase': ['apicbase'],
  'fourth': ['fourth'],
  'trisaas': ['trisaas'],
  'cocentric': ['cocentric'],
  'sunday': ['sunday'],
  'tissl': ['tissl'],
  'clearcourse / giftpro / tissl': ['tissl', 'giftpro', 'clearcourse'],
  'embargo': ['embargo'],
  'monotree': ['monotree'],
  'toast': ['toast'],
  'como': ['como'],
  'storekit': ['storekit'],
};

export function matchTermsForPartner(partnerName: string): string[] {
  const key = partnerName.toLowerCase().trim();
  return PARTNER_VENDOR_ALIASES[key] || [key];
}

export async function getPartnerStackCollectData(partnerName: string): Promise<{
  mentions: number;
  categories: { category: string; count: number }[];
  totalReviews: number;
  marketShare: string;
}> {
  const entries: TechStackEntry[] = await getTechStackEntries();

  const matchTerms = matchTermsForPartner(partnerName);

  const matched = entries.filter(e =>
    matchTerms.some(term => e.tool_name.toLowerCase().trim().includes(term))
  );

  const catCounts: Record<string, number> = {};
  for (const e of matched) {
    catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  }

  const totalSubmissions = new Set(entries.map(e => e.submission_id)).size;

  return {
    mentions: matched.length,
    categories: Object.entries(catCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => ({ category, count })),
    totalReviews: totalSubmissions,
    marketShare: totalSubmissions > 0
      ? ((new Set(matched.map(e => e.submission_id)).size / totalSubmissions) * 100).toFixed(1)
      : '0',
  };
}

export interface PartnerNpsRollup {
  count: number;
  nps: number | null;
  avg: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  bySource: Record<string, number>;
  recent: Array<{
    id: string;
    created_at: string;
    source: NpsScore['source'];
    touchpoint: string | null;
    score: number;
    vendor: string | null;
    company: string | null;
    comment: string | null;
  }>;
}

export async function getPartnerNpsRollup(partnerName: string): Promise<PartnerNpsRollup> {
  const terms = matchTermsForPartner(partnerName);
  const scores = await getNpsScores();

  const matched = scores.filter(s => {
    const v = (s.vendor ?? '').toLowerCase().trim();
    if (!v) return false;
    return terms.some(t => v.includes(t));
  });

  const all = matched.map(s => s.score);
  const promoters  = all.filter(s => s >= 9).length;
  const passives   = all.filter(s => s === 7 || s === 8).length;
  const detractors = all.filter(s => s <= 6).length;
  const bySource: Record<string, number> = {};
  for (const s of matched) bySource[s.source] = (bySource[s.source] || 0) + 1;

  const recent = matched.slice(0, 10).map(s => ({
    id: s.id,
    created_at: s.created_at,
    source: s.source,
    touchpoint: s.touchpoint,
    score: s.score,
    vendor: s.vendor,
    company: s.company,
    comment: s.comment,
  }));

  return {
    count: matched.length,
    nps: all.length ? Math.round(((promoters - detractors) / all.length) * 100) : null,
    avg: all.length ? Number((all.reduce((a, b) => a + b, 0) / all.length).toFixed(1)) : null,
    promoters,
    passives,
    detractors,
    bySource,
    recent,
  };
}

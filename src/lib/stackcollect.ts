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

// --- Knowledge-base survey answer (has_knowledge_base on business_submissions).
// Same shape and pattern as the WhatsApp question — yes/no with venue lists.

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
  // AI review from the stack-review edge function (pipe-separated bullets
  // or occasional long-form narrative). Nullable because older rows and
  // internal imports don't have one.
  recommendations: string | null;
  // From techstackreview migration 010 (forwarded via slack-notify). Both
  // nullable because older submissions don't have them. tech-usage-sync
  // uses these to populate Airtable Venues.Site count and .Brand override,
  // which feed the marketplace's Operators/Venues counts.
  brand_trading_name: string | null;
  site_count: number | null;
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
  submission_id: string | null;
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
  'workforce.com': ['workforce', 'workforce.com'],
  'bizimply': ['bizimply'],
  'square': ['square'],
  'sona': ['sona'],
  // Lightspeed Payments is the partner's payment product — operators list it
  // separately in NPS. Fold it under Lightspeed so their score reflects both.
  'lightspeed': ['lightspeed', 'lightspeed payments'],
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
  'seven rooms': ['sevenrooms', 'seven rooms', '7rooms'],
  'leat': ['leat'],
  // Operators occasionally type "SumUp POS" (the till product) as a distinct
  // vendor. Same company as SumUp payments; roll them up.
  'sumup': ['sumup', 'sumup pos'],
  // Operators sometimes drop the space when typing "Allgravy". Same partner.
  'all gravy': ['all gravy', 'allgravy'],
  // Oracle Simphony was previously branded Micros Simphony — legacy operator
  // data still uses the old name. Alias both to the current partner record.
  'oracle simphony': ['oracle simphony', 'micros', 'micros symphony', 'micros simphony'],
  // pointOne is sometimes typed with a space ("Point one") in NPS submissions.
  'pointone': ['pointone', 'point one'],
  // Partners renamed after their vendor term was already established in stack reviews.
  // Alias the new display name back to the historical vendor term(s).
  'planday from xero': ['planday', 'planday from xero'],
  'planday': ['planday', 'planday from xero'],
  'connect frontline': ['connect', 'connect frontline'],
  'me&u': ['me&u', 'meandu', 'me and u'],
  'ws&co insights': ['wsco', 'ws&co', 'ws co'],
  'prodicta ltd': ['prodicta'],
  // Revvue trades as Revvue.ai and is tagged "Revvue ai" in Airtable —
  // operators type all three spellings in stack reviews.
  'revvue': ['revvue', 'revvue ai', 'revvue.ai'],
  'feedality': ['feedality'],
  'flock x': ['flock x', 'flockx'],
};

export function matchTermsForPartner(partnerName: string): string[] {
  const key = partnerName.toLowerCase().trim();
  return PARTNER_VENDOR_ALIASES[key] || [key];
}

export interface PartnerCategoryRanking {
  category: string;
  partnerCount: number;        // partner's selections in this category
  totalSelections: number;     // all tools' selections in this category
  rank: number;                // 1 = most-picked in this category
  totalTools: number;          // # of distinct tools competing here
  leader: { tool: string; count: number };  // top tool in this category
  shareInCategory: number;     // partnerCount / totalSelections (0..1)
}

export interface PartnerCompetitor {
  tool: string;
  count: number;               // total picks in partner's competing categories
  sharedCategories: number;    // how many of partner's categories this competitor appears in
}

export interface PartnerStackData {
  mentions: number;                       // category-level picks of this partner
  uniqueReviewsWithPartner: number;       // distinct submissions mentioning partner
  categories: { category: string; count: number }[];
  totalReviews: number;                   // submissions with ≥1 valid tool entry
  totalReviewsOnPlatform: number;         // all business_submissions (incl. empty)
  marketShare: string;                    // % of reviews-with-data mentioning partner
  monthlyMentions: { month: string; count: number }[]; // last 12 months
  categoryRankings: PartnerCategoryRanking[];
  topCompetitors: PartnerCompetitor[];    // top 5 rivals in partner's categories
}

// Build a "YYYY-MM" key from an ISO date string. Returns null on invalid input.
function monthKey(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Returns the last `count` months as YYYY-MM, oldest first, ending with current month.
// Date.now() is fine here — this runs server-side on each request, not in a workflow.
function lastNMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function getPartnerStackCollectData(partnerName: string): Promise<PartnerStackData> {
  const [entries, businesses] = await Promise.all([
    getTechStackEntries(),
    getBusinessSubmissions(),
  ]);

  const matchTerms = matchTermsForPartner(partnerName);
  // Word-boundary match, not substring, so short aliases like 'sky' don't
  // grab unrelated tools such as 'Skywire' (EPOS) or 'SkyKick'. Multi-word
  // aliases like 'seven rooms' still work because \b sits at each end.
  const partnerTermPatterns = matchTerms.map(term => {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
  const isPartnerTool = (toolName: string) => {
    const t = toolName.toLowerCase().trim();
    return partnerTermPatterns.some(re => re.test(t));
  };

  const matched = entries.filter(e => isPartnerTool(e.tool_name));

  // Categories the partner appears in, and how many times in each.
  const catCounts: Record<string, number> = {};
  for (const e of matched) catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  const partnerCategories = Object.entries(catCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count }));

  const totalReviews = new Set(entries.map(e => e.submission_id)).size;
  const uniqueReviewsWithPartner = new Set(matched.map(e => e.submission_id)).size;

  // Monthly trend over the last 12 months (matched entries bucketed by created_at).
  const bucketMonths = lastNMonths(12);
  const monthBuckets: Record<string, number> = Object.fromEntries(bucketMonths.map(m => [m, 0]));
  for (const e of matched) {
    const k = monthKey(e.created_at);
    if (k && k in monthBuckets) monthBuckets[k]++;
  }
  const monthlyMentions = bucketMonths.map(m => ({ month: m, count: monthBuckets[m] }));

  // Category rankings: for each of the partner's categories, rank all tools
  // by selection count so the partner can see "you're #2 of 9 in X — leader Y".
  // Folds case + whitespace so "Lightspeed" and "lightspeed " are one tool.
  const partnerCategorySet = new Set(partnerCategories.map(c => c.category));
  const byCategory: Record<string, Record<string, { displayName: string; count: number }>> = {};
  for (const e of entries) {
    if (!partnerCategorySet.has(e.category)) continue;
    const key = e.tool_name.toLowerCase().trim();
    if (!key) continue;
    if (!byCategory[e.category]) byCategory[e.category] = {};
    const bucket = byCategory[e.category];
    if (!bucket[key]) bucket[key] = { displayName: e.tool_name.trim(), count: 0 };
    bucket[key].count++;
  }

  const categoryRankings: PartnerCategoryRanking[] = partnerCategories.map(({ category, count }) => {
    const toolsHere = Object.entries(byCategory[category] || {})
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
    const partnerKey = toolsHere.find(t => isPartnerTool(t.key))?.key;
    const rank = partnerKey ? toolsHere.findIndex(t => t.key === partnerKey) + 1 : 0;
    const leader = toolsHere[0] || { displayName: '—', count: 0 };
    const totalSelections = toolsHere.reduce((a, t) => a + t.count, 0);
    return {
      category,
      partnerCount: count,
      totalSelections,
      rank,
      totalTools: toolsHere.length,
      leader: { tool: leader.displayName, count: leader.count },
      shareInCategory: totalSelections > 0 ? count / totalSelections : 0,
    };
  });

  // Top competitors: other tools picked in the partner's own categories,
  // weighted by total appearances. `sharedCategories` says how many of the
  // partner's categories each rival shows up in (breadth signal).
  const competitorTotals: Record<string, { displayName: string; count: number; categories: Set<string> }> = {};
  for (const e of entries) {
    if (!partnerCategorySet.has(e.category)) continue;
    if (isPartnerTool(e.tool_name)) continue;
    const key = e.tool_name.toLowerCase().trim();
    if (!key) continue;
    if (!competitorTotals[key]) {
      competitorTotals[key] = { displayName: e.tool_name.trim(), count: 0, categories: new Set() };
    }
    competitorTotals[key].count++;
    competitorTotals[key].categories.add(e.category);
  }
  const topCompetitors = Object.values(competitorTotals)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(c => ({ tool: c.displayName, count: c.count, sharedCategories: c.categories.size }));

  return {
    mentions: matched.length,
    uniqueReviewsWithPartner,
    categories: partnerCategories,
    totalReviews,
    totalReviewsOnPlatform: businesses.length,
    marketShare: totalReviews > 0
      ? ((uniqueReviewsWithPartner / totalReviews) * 100).toFixed(1)
      : '0',
    monthlyMentions,
    categoryRankings,
    topCompetitors,
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

  // Same word-boundary match as the tech-stack side so 'sky' doesn't grab
  // 'Skywire' etc. Keeps NPS attribution in sync with StackCollect ranks.
  const termPatterns = terms.map(term => {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
  const matched = scores.filter(s => {
    const v = (s.vendor ?? '').trim();
    if (!v) return false;
    return termPatterns.some(re => re.test(v));
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

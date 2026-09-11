import { cache } from 'react';

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

// Columns every consumer needs. `select=*` used to pull two long free-text
// columns — biggest_challenge and the AI-written recommendations — on every
// read, including partner page loads that never render either. They're now
// opt-in via `includeNarrative`, which only /api/tech-check needs.
const SUBMISSION_COLUMNS = [
  'id', 'business_name', 'industry', 'size', 'location', 'contact_name',
  'contact_email', 'role', 'created_at', 'phone_number', 'number_of_locations',
  'vertical', 'submission_type', 'brand_trading_name', 'site_count',
].join(',');

// Wrapped in React's cache() so the several callers that each need the full
// submission list inside one request share a single read + filter pass. The
// underlying fetch is already revalidated for 5 minutes, but the JSON parse
// and test-row filter over every row were being repeated per call.
// The parameter is a primitive, not an options object, because cache() keys
// on argument identity — an object literal would defeat the dedupe.
export const getBusinessSubmissions = cache(
  async (includeNarrative = false): Promise<BusinessSubmission[]> => {
    const columns = includeNarrative
      ? `${SUBMISSION_COLUMNS},biggest_challenge,recommendations`
      : SUBMISSION_COLUMNS;
    const all = await supabaseFetchAll(
      'business_submissions',
      `select=${columns}&order=created_at.desc`
    );
    // Filter out test submissions. The two narrative columns are normalised to
    // null when not selected so the returned shape matches BusinessSubmission
    // either way and callers never see `undefined`.
    return all
      .filter(b => !isTestSubmission(b.business_name))
      .map(b => ({
        ...b,
        biggest_challenge: b.biggest_challenge ?? null,
        recommendations: b.recommendations ?? null,
      }));
  }
);

// Tool names we never want to surface in the portal — placeholder/empty
// values that pollute the rankings.
const NA_TOOL_PATTERN = /^(n\/?a|none|null|n\.a\.?|—|-|other)$/i;

function isMeaningfulTool(toolName: string | null | undefined): boolean {
  if (!toolName) return false;
  const t = toolName.trim();
  if (!t) return false;
  return !NA_TOOL_PATTERN.test(t);
}

export const getTechStackEntries = cache(async (): Promise<TechStackEntry[]> => {
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
});

export async function getToolUsageStats(): Promise<ToolUsageStat[]> {
  const all = await supabaseFetchAll('analytics_tool_usage', 'select=*&order=usage_count.desc');
  return all.filter((t: ToolUsageStat) => isMeaningfulTool(t.tool_name));
}

export async function getPOSMarketShare(): Promise<POSMarketShare[]> {
  return supabaseFetchAll('analytics_pos_systems', 'select=*&order=market_share_percentage.desc');
}

// cache()'d for the same reason as getBusinessSubmissions: several callers
// need the whole table inside one request. Every call site is argument-free,
// so they all share one read.
export const getNpsScores = cache(async (params: { source?: NpsScore['source']; limit?: number } = {}): Promise<NpsScore[]> => {
  const qs: string[] = ['select=*', 'order=created_at.desc'];
  if (params.source) qs.push(`source=eq.${params.source}`);

  // NPS lands in near real-time, so this deliberately doesn't sit on the
  // 5-minute supabaseFetch cache. It used to be `no-store`, which meant the
  // full table was re-read on every single request; 60s keeps the dashboard
  // effectively live while stopping a partner page load from paging the whole
  // table twice. Drop back to 'no-store' if a rating ever needs to appear
  // within the same minute it lands.
  const rows: NpsScore[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/nps_scores?${qs.join('&')}&limit=${pageSize}&offset=${offset}`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 60 },
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
});

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
  // Keyed on the partner's Airtable Name. Partner record is "Sky Business",
  // so the old 'sky' key never fired.
  'sky business': ['sky', 'sky business'],
  'sky': ['sky', 'sky business'],
  'workforce': ['workforce'],
  'workforce.com': ['workforce', 'workforce.com'],
  'bizimply': ['bizimply'],
  'square': ['square'],
  'sona': ['sona'],
  // Lightspeed Payments is the partner's payment product — operators list it
  // separately in NPS. Fold it under Lightspeed so their score reflects both.
  'lightspeed': ['lightspeed', 'lightspeed payments'],
  'nory': ['nory'],
  // Partner record is "Cinchio Solutions" — old 'cinchio' key never fired.
  'cinchio solutions': ['cinchio', 'cinchio solutions'],
  'cinchio': ['cinchio', 'cinchio solutions'],
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
  // Partner record is "SevenRooms" (one word) — the old 'seven rooms' key
  // never fired, so the multi-spelling rollup was never actually applied.
  'sevenrooms': ['sevenrooms', 'seven rooms', '7rooms'],
  // The lead sheet spells it with a space, so a partner resolved from lead
  // data alone would arrive here as "Seven Rooms" and miss the other two.
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
  // Three spellings in the wild: the marketplace record, the legacy lead
  // option, and "by Xero" from the Master Lead Sheet. Operators also type
  // "plan day". All of them are this one partner.
  'planday from xero': ['planday', 'plan day', 'planday from xero', 'planday by xero'],
  'planday by xero': ['planday', 'plan day', 'planday from xero', 'planday by xero'],
  'planday': ['planday', 'plan day', 'planday from xero', 'planday by xero'],
  'connect frontline': ['connect', 'connect frontline'],
  'me&u': ['me&u', 'meandu', 'me and u'],
  'ws&co insights': ['wsco', 'ws&co', 'ws co'],
  'prodicta ltd': ['prodicta'],
  // Revvue trades as Revvue.ai and is tagged "Revvue ai" in Airtable —
  // operators type all three spellings in stack reviews.
  'revvue': ['revvue', 'revvue ai', 'revvue.ai'],
  // Partner record is spelled "Feedelity"; the key was misspelled, so this
  // entry never fired. Keep the old spelling as a matchable alias.
  'feedelity': ['feedelity', 'feedality'],
  'feedality': ['feedelity', 'feedality'],
  'flock x': ['flock x', 'flockx'],
  // Added after auditing Tech Usage for tool names that matched no partner.
  // Row counts are the orphaned Tech Usage rows each one reclaims.
  'rotaready': ['rotaready', 'rota ready'],                       // 52 rows
  'cpl learning': ['cpl learning', 'cpl'],                        // 11 rows
  'tahola, an ometis company': ['tahola', 'tahola, an ometis company'], // 10 rows
  'captive wifi': ['captive wifi', 'captive'],                    //  2 rows
  'vita mojo': ['vita mojo', 'vitamojo', 'vita'],                 //  2 rows
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

// ---------------------------------------------------------------------------
// Marketplace operator counts.
//
// The marketplace tile and this portal have always disagreed about how many
// operators use a partner. The marketplace counts distinct operator BRANDS
// (multi-site chains collapsed through Venues."Brand override" in Airtable),
// while everything below counts stack-review submissions. Both are true, but a
// partner looking at both pages sees two answers to what reads like one
// question — Fourth was 54 on the marketplace and 112 here.
//
// We deliberately do NOT reimplement brand grouping in this file. Two
// codebases independently computing "distinct brands" drift apart the moment
// their name normalisation, test-row filtering or cache windows differ, and
// Airtable only holds venues that tech-usage-sync has created, so a local join
// would have coverage gaps too. Instead we read the exact field the
// marketplace renders. One number, one source, guaranteed to match.
const MP_BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID;
const MP_KEY = process.env.MARKETPLACE_AIRTABLE_KEY;
const MP_PARTNERS_TABLE = process.env.MARKETPLACE_PARTNERS_TABLE || 'Partners';

export interface MarketplaceCounts {
  operators: number | null;   // Partners."Operators (brands)"
  venues: number | null;      // Partners."Venues using"
}

// The marketplace Partners table is ~60 rows, so one read builds the whole map
// and cache() shares it across every caller in the request.
const getMarketplaceCountsByName = cache(async (): Promise<Map<string, MarketplaceCounts>> => {
  const out = new Map<string, MarketplaceCounts>();
  if (!MP_BASE || !MP_KEY) return out;
  try {
    let offset: string | undefined;
    do {
      const url = new URL(
        `https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(MP_PARTNERS_TABLE)}`
      );
      url.searchParams.set('pageSize', '100');
      for (const f of ['Name', 'Operators (brands)', 'Venues using']) {
        url.searchParams.append('fields[]', f);
      }
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${MP_KEY}` },
        next: { revalidate: 300 },
      });
      if (!res.ok) return out;
      const data = await res.json();
      for (const r of data.records ?? []) {
        const name = (r.fields?.Name ?? '').toString().trim().toLowerCase();
        if (!name) continue;
        const ops = r.fields?.['Operators (brands)'];
        const ven = r.fields?.['Venues using'];
        out.set(name, {
          operators: typeof ops === 'number' ? ops : null,
          venues: typeof ven === 'number' ? ven : null,
        });
      }
      offset = data.offset;
    } while (offset);
  } catch {
    // Marketplace unreachable. The page still renders on review-based counts;
    // the operator tile just falls back rather than the whole section failing.
    return out;
  }
  return out;
});

// Partner names are the join key everywhere else in this file (see
// PARTNER_VENDOR_ALIASES), so we match on name rather than slug — the portal
// CRM base and the marketplace base don't share slugs.
export async function getMarketplaceCounts(partnerName: string): Promise<MarketplaceCounts | null> {
  const map = await getMarketplaceCountsByName();
  return map.get(partnerName.trim().toLowerCase()) ?? null;
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
  // Distinct operator brands / physical sites, read straight off the
  // marketplace Partners record so this page and the marketplace tile can
  // never disagree. null when the partner isn't on the marketplace or
  // Airtable is unreachable — the UI falls back to the review-based count.
  marketplaceOperators: number | null;
  marketplaceVenues: number | null;
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
  const [entries, businesses, marketplace] = await Promise.all([
    getTechStackEntries(),
    getBusinessSubmissions(),
    getMarketplaceCounts(partnerName),
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
    marketplaceOperators: marketplace?.operators ?? null,
    marketplaceVenues: marketplace?.venues ?? null,
  };
}

// ---------------------------------------------------------------------------
// Vendor Score Intelligence — the £249 tier's core deliverable.
//
// The monthly report is a broadcast product: every partner gets the same PDF.
// This is the opposite — a partner-specific read of their own SOS, cut three
// ways that a report can't do:
//
//   1. bySegment / bySiteBand — where their product-market fit is weakest.
//      nps_scores.submission_id joins to business_submissions, which carries
//      the venue type and site count the operator gave at step 1 of the stack
//      review (before they rated anything), so the segment is never inferred.
//   2. categories — their SOS against the category average and the category
//      leader's SOS. The leader is deliberately ANONYMOUS: partners get the
//      number to aim at, not a rival's name. That's what keeps operators
//      willing to rate honestly and keeps us out of comparative-advertising
//      arguments.
//   3. trend — monthly SOS plus a rolling all-time SOS. With our response
//      volume the monthly figure is noisy, so `cumulativeSos` is the line to
//      show a partner: it moves slowly and it moves for real reasons.
//
// NOT here, deliberately: per-dimension scores (onboarding / support / value).
// The stack review captures exactly one 0–10 "would you recommend?" per vendor
// per submission, so a dimension breakdown would be invented, not measured.
// Adding it means new questions on the operator form and a schema change.

// A vendor needs this many responses in a slice before we'll rank or publish
// a score for it. Matches SosLeagueTable's threshold so a partner never sees
// a number here that the internal league table considers too thin to rank.
export const MIN_SCORE_RESPONSES = 2;

// SOS (Stacked Operator Score) — a 0–5 operator-facing expression of the same
// 0–10 ratings NPS is built from. Single definition, used everywhere below.
export function sosFromAvg(avg: number): number {
  return Math.round((avg / 2) * 10) / 10;
}

// Diagnostic and smoke-test rows that must never reach a partner's dashboard
// or a vendor aggregate. Vendors prefixed '__' are diagnostic markers
// (__e2e_check__, __diag_vendor__); the two touchpoints are QA fixtures used
// to test the low-NPS Slack alert and the insert pipeline.
const TEST_NPS_TOUCHPOINTS = new Set(['pipeline-smoke-test', 'low-nps-slack-test']);

export function excludeTestNpsRows(scores: NpsScore[]): NpsScore[] {
  return scores.filter(
    s => !(s.vendor ?? '').trim().startsWith('__') && !TEST_NPS_TOUCHPOINTS.has(s.touchpoint ?? '')
  );
}

export interface ScoreSlice {
  key: string;              // stable id for React keys / sorting
  label: string;            // operator-facing label ('QSR / fast casual')
  sos: number | null;       // null when there are no responses at all
  count: number;
  provisional: boolean;     // count < MIN_SCORE_RESPONSES — show, but caveat it
  vsOverall: number | null; // SOS delta against the partner's own overall SOS
}

export interface CategoryPosition {
  category: string;
  sos: number;              // partner's SOS in this category
  count: number;            // partner's responses in this category
  categoryAverage: number;  // response-weighted mean SOS of every rating here
  leaderSos: number | null; // best-scoring ranked vendor in this category
  leaderName: string | null; // and who it is — partners asked to see the name
  rank: number;             // partner's rank among ranked vendors (0 = unranked)
  totalRanked: number;      // vendors in this category clearing MIN_SCORE_RESPONSES
  gapToAverage: number;     // partner SOS − category average
  gapToLeader: number | null;
}

export interface ScoreTrendPoint {
  month: string;              // YYYY-MM
  sos: number | null;         // that month's SOS, null if no responses
  count: number;              // responses that month
  cumulativeSos: number | null; // rolling all-time SOS up to and including this month
  cumulativeCount: number;
}

// The raw sentiment detail that used to be its own NPS card. Folded in here
// because both were computed from the same nps_scores rows via two separate
// full-table reads, and because showing a partner an SOS of 3.6 next to an NPS
// of 27 invited "so which one is my score?" every time.
export interface PartnerSentiment {
  nps: number | null;
  avg: number | null;              // mean 0–10 rating, the SOS before halving
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

export interface PartnerScoreIntelligence {
  overall: { sos: number | null; avg: number | null; count: number };
  sentiment: PartnerSentiment;
  bySegment: ScoreSlice[];    // venue type
  bySiteBand: ScoreSlice[];   // site-count band
  categories: CategoryPosition[];
  trend: ScoreTrendPoint[];
  // Movement across the trend window, on the rolling figure. Null until there
  // are two months with data — an honest "not yet" beats a fake delta.
  movement: { from: number; to: number; delta: number; months: number } | null;
  // Responses we couldn't segment (no submission_id — pre-migration rows and
  // anything arriving from the support bot rather than the stack review).
  // Surfaced so the segment totals visibly reconcile against `overall.count`.
  unsegmented: number;
  minResponses: number;
  marketResponses: number;    // every clean rating on the platform, for context
}

// Venue types in the order the operator sees them on the stack review, so a
// partner's segment table reads the same way the funnel does. Labels must
// match business_submissions.vertical exactly (written by slack-notify's
// VERTICAL_LABEL map).
const VENUE_SEGMENTS: { key: string; label: string }[] = [
  { key: 'indie', label: 'Independent restaurant' },
  { key: 'group', label: 'Multi-site restaurant group' },
  { key: 'bar',   label: 'Bar / pub' },
  { key: 'qsr',   label: 'QSR / fast casual' },
  { key: 'hotel', label: 'Hotel F&B' },
  { key: 'other', label: 'Other' },
];
const VENUE_LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  VENUE_SEGMENTS.map(s => [s.label.toLowerCase(), s.key])
);

const SITE_BANDS: { key: string; label: string; test: (sites: number) => boolean }[] = [
  { key: '1',    label: 'Single site',  test: n => n === 1 },
  { key: '2-5',  label: '2–5 sites',    test: n => n >= 2 && n <= 5 },
  { key: '6-20', label: '6–20 sites',   test: n => n >= 6 && n <= 20 },
  { key: '20+',  label: '20+ sites',    test: n => n > 20 },
];

// Site count comes from two places: `site_count` (exact integer, newer rows)
// and `number_of_locations` (a band label like '2–5 sites', older rows). Prefer
// the exact number; fall back to the first integer in the label, which lands
// every band on its lower bound and therefore in the right bucket.
function siteBandKey(sub: { site_count: number | null; number_of_locations: string | null }): string | null {
  let n: number | null = typeof sub.site_count === 'number' && sub.site_count > 0 ? sub.site_count : null;
  if (n === null && sub.number_of_locations) {
    const m = sub.number_of_locations.match(/\d+/);
    if (m) n = parseInt(m[0], 10);
  }
  if (n === null || !Number.isFinite(n) || n < 1) return null;
  return SITE_BANDS.find(b => b.test(n as number))?.key ?? null;
}

// Turn a bucket of raw 0–10 ratings into a publishable slice.
function toSlice(
  key: string,
  label: string,
  ratings: number[],
  overallSos: number | null
): ScoreSlice {
  if (ratings.length === 0) {
    return { key, label, sos: null, count: 0, provisional: true, vsOverall: null };
  }
  const sos = sosFromAvg(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  return {
    key,
    label,
    sos,
    count: ratings.length,
    provisional: ratings.length < MIN_SCORE_RESPONSES,
    vsOverall: overallSos === null ? null : Number((sos - overallSos).toFixed(1)),
  };
}

export async function getPartnerScoreIntelligence(partnerName: string): Promise<PartnerScoreIntelligence> {
  const [rawScores, businesses] = await Promise.all([
    getNpsScores(),
    getBusinessSubmissions(),
  ]);
  const scores = excludeTestNpsRows(rawScores);

  // Same word-boundary matching the rest of the partner pages use, so this
  // dashboard and the NPS rollup above never disagree about which ratings
  // belong to the partner.
  const termPatterns = matchTermsForPartner(partnerName).map(term => {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
  const isPartnerVendor = (vendor: string | null) => {
    const v = (vendor ?? '').trim();
    return !!v && termPatterns.some(re => re.test(v));
  };

  const mine = scores.filter(s => isPartnerVendor(s.vendor));
  const myRatings = mine.map(s => s.score);
  const overallSos = myRatings.length
    ? sosFromAvg(myRatings.reduce((a, b) => a + b, 0) / myRatings.length)
    : null;
  const overall = {
    sos: overallSos,
    avg: myRatings.length
      ? Number((myRatings.reduce((a, b) => a + b, 0) / myRatings.length).toFixed(1))
      : null,
    count: myRatings.length,
  };

  // --- Sentiment detail ----------------------------------------------------
  // Same rows, no extra read: `mine` is already every rating for this partner.
  const promoters  = myRatings.filter(v => v >= 9).length;
  const passives   = myRatings.filter(v => v === 7 || v === 8).length;
  const detractors = myRatings.filter(v => v <= 6).length;
  const bySource: Record<string, number> = {};
  for (const r of mine) bySource[r.source] = (bySource[r.source] || 0) + 1;

  const sentiment: PartnerSentiment = {
    nps: myRatings.length
      ? Math.round(((promoters - detractors) / myRatings.length) * 100)
      : null,
    avg: overall.avg,
    promoters,
    passives,
    detractors,
    bySource,
    // Already ordered newest-first by getNpsScores.
    recent: mine.slice(0, 10).map(r => ({
      id: r.id,
      created_at: r.created_at,
      source: r.source,
      touchpoint: r.touchpoint,
      score: r.score,
      vendor: r.vendor,
      company: r.company,
      comment: r.comment,
    })),
  };

  // --- 1. Segment breakdown ------------------------------------------------
  const subById = new Map(businesses.map(b => [b.id, b]));
  const bySegmentRatings: Record<string, number[]> = {};
  const bySiteRatings: Record<string, number[]> = {};
  let unsegmented = 0;

  for (const s of mine) {
    const sub = s.submission_id ? subById.get(s.submission_id) : undefined;
    if (!sub) { unsegmented++; continue; }

    const segKey = VENUE_LABEL_TO_KEY[(sub.vertical ?? '').trim().toLowerCase()] ?? 'other';
    (bySegmentRatings[segKey] ||= []).push(s.score);

    const bandKey = siteBandKey(sub);
    if (bandKey) (bySiteRatings[bandKey] ||= []).push(s.score);
  }

  // Keep only segments the partner actually has ratings in — an empty row for
  // every venue type makes a thin dataset look like a broken dashboard.
  const bySegment = VENUE_SEGMENTS
    .filter(s => (bySegmentRatings[s.key]?.length ?? 0) > 0)
    .map(s => toSlice(s.key, s.label, bySegmentRatings[s.key], overallSos))
    .sort((a, b) => (b.sos ?? 0) - (a.sos ?? 0));

  const bySiteBand = SITE_BANDS
    .filter(b => (bySiteRatings[b.key]?.length ?? 0) > 0)
    .map(b => toSlice(b.key, b.label, bySiteRatings[b.key], overallSos));

  // --- 2. Category position ------------------------------------------------
  // Categories are labels on individual ratings, so a partner can legitimately
  // appear in more than one (a POS with built-in inventory, say). Position is
  // computed per category against every other vendor rated in it.
  const myCategories = new Set(
    mine.map(s => (s.category ?? '').trim()).filter(Boolean)
  );

  const categories: CategoryPosition[] = [];
  for (const category of myCategories) {
    const here = scores.filter(s => (s.category ?? '').trim() === category);

    // Response-weighted category average: the mean of every rating given in
    // this category. With our volume this is far steadier than averaging
    // vendor means, where one 2-response vendor can swing the benchmark.
    const allHere = here.map(s => s.score);
    const categoryAverage = sosFromAvg(allHere.reduce((a, b) => a + b, 0) / allHere.length);

    // Rank vendors that clear the response threshold. Vendor keys fold case
    // and whitespace, matching rollupNpsByVendor.
    const byVendor = new Map<string, number[]>();
    // Vendor keys fold case and whitespace to match rollupNpsByVendor, but
    // partners are shown the leader by name now, so keep the first spelling
    // an operator actually typed rather than the folded key.
    const vendorLabel = new Map<string, string>();
    for (const s of here) {
      const raw = (s.vendor ?? '').trim();
      const key = raw.toLowerCase();
      if (!key) continue;
      if (!vendorLabel.has(key)) vendorLabel.set(key, raw);
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key)!.push(s.score);
    }
    const ranked = Array.from(byVendor.entries())
      .filter(([, arr]) => arr.length >= MIN_SCORE_RESPONSES)
      .map(([key, arr]) => ({
        key,
        label: vendorLabel.get(key) || key,
        sos: sosFromAvg(arr.reduce((a, b) => a + b, 0) / arr.length),
        count: arr.length,
      }))
      .sort((a, b) => (b.sos - a.sos) || (b.count - a.count));

    const myRatingsHere = here.filter(s => isPartnerVendor(s.vendor)).map(s => s.score);
    if (myRatingsHere.length === 0) continue;
    const mySos = sosFromAvg(myRatingsHere.reduce((a, b) => a + b, 0) / myRatingsHere.length);

    const myRankIndex = ranked.findIndex(r => isPartnerVendor(r.key));
    const leaderSos = ranked.length > 0 ? ranked[0].sos : null;
    const leaderName = ranked.length > 0 ? ranked[0].label : null;

    categories.push({
      category,
      sos: mySos,
      count: myRatingsHere.length,
      categoryAverage,
      leaderSos,
      leaderName,
      rank: myRankIndex >= 0 ? myRankIndex + 1 : 0,
      totalRanked: ranked.length,
      gapToAverage: Number((mySos - categoryAverage).toFixed(1)),
      gapToLeader: leaderSos === null ? null : Number((mySos - leaderSos).toFixed(1)),
    });
  }
  categories.sort((a, b) => b.count - a.count);

  // --- 3. Trend ------------------------------------------------------------
  const months = lastNMonths(12);
  const monthlyRatings: Record<string, number[]> = Object.fromEntries(months.map(m => [m, []]));
  // Ratings older than the window still count towards the rolling figure —
  // otherwise a partner's cumulative SOS would appear to reset at 12 months.
  const windowStart = months[0];
  let priorSum = 0;
  let priorCount = 0;
  for (const s of mine) {
    const k = monthKey(s.created_at);
    if (!k) continue;
    if (k in monthlyRatings) monthlyRatings[k].push(s.score);
    else if (k < windowStart) { priorSum += s.score; priorCount++; }
  }

  let runningSum = priorSum;
  let runningCount = priorCount;
  const trend: ScoreTrendPoint[] = months.map(month => {
    const arr = monthlyRatings[month];
    runningSum += arr.reduce((a, b) => a + b, 0);
    runningCount += arr.length;
    return {
      month,
      sos: arr.length ? sosFromAvg(arr.reduce((a, b) => a + b, 0) / arr.length) : null,
      count: arr.length,
      cumulativeSos: runningCount ? sosFromAvg(runningSum / runningCount) : null,
      cumulativeCount: runningCount,
    };
  });

  // Movement on the rolling figure, between the first and last months that
  // actually have a value. Needs two distinct points to mean anything.
  const withValue = trend.filter(p => p.cumulativeSos !== null);
  const movement = withValue.length >= 2
    ? {
        from: withValue[0].cumulativeSos!,
        to: withValue[withValue.length - 1].cumulativeSos!,
        delta: Number((withValue[withValue.length - 1].cumulativeSos! - withValue[0].cumulativeSos!).toFixed(1)),
        months: withValue.length,
      }
    : null;

  return {
    overall,
    sentiment,
    bySegment,
    bySiteBand,
    categories,
    trend,
    movement,
    unsegmented,
    minResponses: MIN_SCORE_RESPONSES,
    marketResponses: scores.length,
  };
}

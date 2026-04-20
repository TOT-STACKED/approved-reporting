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

export async function getTechStackEntries(): Promise<TechStackEntry[]> {
  const [entries, validBusinesses] = await Promise.all([
    supabaseFetchAll('tech_stack_entries', 'select=*&order=created_at.desc'),
    getBusinessSubmissions(),
  ]);

  // Only include entries whose submission_id matches a non-test business
  const validIds = new Set(validBusinesses.map(b => b.id));
  return entries.filter(e => validIds.has(e.submission_id));
}

export async function getToolUsageStats(): Promise<ToolUsageStat[]> {
  return supabaseFetchAll('analytics_tool_usage', 'select=*&order=usage_count.desc');
}

export async function getPOSMarketShare(): Promise<POSMarketShare[]> {
  return supabaseFetchAll('analytics_pos_systems', 'select=*&order=market_share_percentage.desc');
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

export async function getPartnerStackCollectData(partnerName: string): Promise<{
  mentions: number;
  categories: { category: string; count: number }[];
  totalReviews: number;
  marketShare: string;
}> {
  const entries: TechStackEntry[] = await getTechStackEntries();

  const partnerLower = partnerName.toLowerCase().trim();

  const aliases: Record<string, string[]> = {
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

  const matchTerms = aliases[partnerLower] || [partnerLower];

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

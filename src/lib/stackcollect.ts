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

export interface TechStackEntry {
  id: string;
  submission_id: string;
  category: string;
  tool_name: string;
  created_at: string;
}

export interface StackCollectStats {
  totalReviews: number;
  totalToolEntries: number;
  partnerMentions: number;
  categories: Record<string, number>;
  topTools: { name: string; count: number }[];
  partnerToolData: { category: string; tool_name: string; count: number }[];
}

export async function getTechStackEntries(): Promise<TechStackEntry[]> {
  // Paginate through all entries (Supabase caps at 1000 per request)
  const allEntries: TechStackEntry[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const batch = await supabaseFetch(
      'tech_stack_entries',
      `select=*&limit=${pageSize}&offset=${offset}&order=created_at.desc`
    );
    allEntries.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return allEntries;
}

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

  // Normalize partner name for matching
  const partnerLower = partnerName.toLowerCase().trim();

  // Map partner names to possible tool names in StackCollect
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

  // Find matching entries
  const matched = entries.filter(e =>
    matchTerms.some(term => e.tool_name.toLowerCase().trim().includes(term))
  );

  // Group by category
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

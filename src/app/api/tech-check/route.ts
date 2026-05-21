import { NextResponse } from 'next/server';
import { getTechStackEntries, getBusinessSubmissions } from '@/lib/stackcollect';

// Internal only — gated by the auth proxy (not in PUBLIC_PREFIXES).
// Returns the "tech check" answers grouped by category → tool → venues.
// Designed so the dashboard can render any category dynamically, and clicking
// a tool reveals the exact venues for follow-up (= leads).

export const dynamic = 'force-dynamic';

export interface TechCheckVenue {
  submissionId: string;
  businessName: string;
  contactName: string | null;
  contactEmail: string;
  role: string | null;
  location: string | null;
  size: string | null;
  numberOfLocations: string | null;
  biggestChallenge: string | null;
  createdAt: string;
}

export interface TechCheckTool {
  tool: string;
  count: number;
  venues: TechCheckVenue[];
}

export interface TechCheckCategory {
  category: string;
  totalAnswers: number;
  uniqueVenues: number;
  tools: TechCheckTool[];
}

export async function GET() {
  try {
    const [entries, businesses] = await Promise.all([
      getTechStackEntries(),
      getBusinessSubmissions(),
    ]);

    // Build a fast lookup so we can attach venue details to each entry once.
    const bizById = new Map(businesses.map(b => [b.id, b]));

    // Group: category → tool → list of venue records.
    const byCategory = new Map<string, Map<string, TechCheckVenue[]>>();
    for (const e of entries) {
      const biz = bizById.get(e.submission_id);
      if (!biz) continue;
      const category = (e.category || '').trim();
      const tool = (e.tool_name || '').trim();
      if (!category || !tool) continue;

      if (!byCategory.has(category)) byCategory.set(category, new Map());
      const toolMap = byCategory.get(category)!;
      if (!toolMap.has(tool)) toolMap.set(tool, []);
      toolMap.get(tool)!.push({
        submissionId: biz.id,
        businessName: biz.business_name,
        contactName: biz.contact_name,
        contactEmail: biz.contact_email,
        role: biz.role,
        location: biz.location,
        size: biz.size,
        numberOfLocations: biz.number_of_locations,
        biggestChallenge: biz.biggest_challenge,
        createdAt: e.created_at,
      });
    }

    const categories: TechCheckCategory[] = Array.from(byCategory.entries()).map(
      ([category, toolMap]) => {
        const tools = Array.from(toolMap.entries())
          .map(([tool, venues]) => ({ tool, count: venues.length, venues }))
          .sort((a, b) => b.count - a.count);
        const uniqueVenuesSet = new Set<string>();
        for (const t of tools) for (const v of t.venues) uniqueVenuesSet.add(v.submissionId);
        return {
          category,
          totalAnswers: tools.reduce((s, t) => s + t.count, 0),
          uniqueVenues: uniqueVenuesSet.size,
          tools,
        };
      }
    );

    // Pin priority categories first (HR, Learning, WhatsApp / Communication),
    // then everything else by volume. Match is case/whitespace-insensitive
    // and accepts a few common variants.
    const PRIORITY: string[] = ['hr', 'learning', 'whatsapp', 'comms', 'communication'];
    const priorityRank = (cat: string) => {
      const c = cat.trim().toLowerCase();
      const i = PRIORITY.findIndex(p => c === p || c.includes(p));
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    categories.sort((a, b) => {
      const ra = priorityRank(a.category);
      const rb = priorityRank(b.category);
      if (ra !== rb) return ra - rb;
      return b.totalAnswers - a.totalAnswers;
    });

    const totalAnswers = categories.reduce((s, c) => s + c.totalAnswers, 0);
    const totalVenues = new Set<string>();
    for (const c of categories) for (const t of c.tools) for (const v of t.venues) totalVenues.add(v.submissionId);

    return NextResponse.json({
      categories,
      totalAnswers,
      totalVenues: totalVenues.size,
      totalCategories: categories.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

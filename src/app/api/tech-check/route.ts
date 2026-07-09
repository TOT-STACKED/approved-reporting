import { NextResponse } from 'next/server';
import { getTechStackEntries, getBusinessSubmissions, getWhatsappResponses, getKnowledgeBaseResponses } from '@/lib/stackcollect';

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
  phoneNumber: string | null;
  role: string | null;
  location: string | null;
  size: string | null;
  numberOfLocations: string | null;
  industry: string | null;
  vertical: string | null;
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
    const [entries, businesses, whatsapp, knowledgeBase] = await Promise.all([
      getTechStackEntries(),
      getBusinessSubmissions(),
      getWhatsappResponses(),
      getKnowledgeBaseResponses(),
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
        phoneNumber: biz.phone_number,
        role: biz.role,
        location: biz.location,
        size: biz.size,
        numberOfLocations: biz.number_of_locations,
        industry: biz.industry,
        vertical: biz.vertical,
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

    // Pin the lead-gen priority cluster first: the people/team & learning
    // categories that map to partner pitches. Everything else sorts by volume.
    // Order here = display order at the top of the dashboard section.
    // Post-consolidation (25 categories): time & attendance + applicant
    // tracking got folded into People Management / Payroll.
    const PRIORITY: string[] = [
      'people management',
      'learning & development',
      'payroll',
    ];
    const priorityRank = (cat: string) => {
      const c = cat.trim().toLowerCase();
      const i = PRIORITY.indexOf(c);
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
      whatsapp,
      knowledgeBase,
      categories,
      totalAnswers,
      totalVenues: totalVenues.size,
      totalCategories: categories.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getTechStackEntries, getBusinessSubmissions, getWhatsappResponses, getKnowledgeBaseResponses, getNpsScores } from '@/lib/stackcollect';

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

export interface TechCheckVenueDrilldown {
  submissionId: string;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  location: string | null;
  size: string | null;
  numberOfLocations: string | null;
  industry: string | null;
  vertical: string | null;
  biggestChallenge: string | null;
  createdAt: string;
  toolCount: number;
  npsCount: number;
  avgNps: number | null;    // 0..10, one decimal, null if no scores
  // AI-generated recommendations from the stack-review edge function
  // (persisted back to business_submissions.recommendations). Usually
  // pipe-separated bullets, occasionally longer narrative.
  recommendations: string | null;
  byCategory: Array<{
    category: string;
    tools: Array<{ tool: string; nps: number | null; comment: string | null }>;
  }>;
  // NPS scores attributed to this venue but whose vendor didn't match any
  // tool_name in their tech_stack_entries — usually because the operator
  // rated a product with a slightly different name than what they picked
  // in the form. Shown as an "additional scores" section so nothing hides.
  extraNps: Array<{ vendor: string; category: string | null; score: number; comment: string | null }>;
}

export async function GET() {
  try {
    const [entries, businesses, whatsapp, knowledgeBase, npsAll] = await Promise.all([
      getTechStackEntries(),
      getBusinessSubmissions(),
      getWhatsappResponses(),
      getKnowledgeBaseResponses(),
      getNpsScores(),
    ]);

    // Build a fast lookup so we can attach venue details to each entry once.
    const bizById = new Map(businesses.map(b => [b.id, b]));

    // Fold ~12 legacy-taxonomy rows from before Lovable consolidated to the
    // 25-category taxonomy. Cheaper to fold at read-time than to migrate the
    // rows in Supabase — same result, no data mutation risk.
    const CATEGORY_FOLD: Record<string, string> = {
      'epos': 'Point of Sale',
      'workforce': 'People Management',
      'inventory': 'Inventory & Stock Management',
      'learning': 'Learning & Development',
      'finance / ops management': 'Finance & Accounting',
      'loyalty / crm': 'Loyalty & CRM',
    };

    // Group: category → tool → list of venue records.
    const byCategory = new Map<string, Map<string, TechCheckVenue[]>>();
    for (const e of entries) {
      const biz = bizById.get(e.submission_id);
      if (!biz) continue;
      const rawCategory = (e.category || '').trim();
      const category = CATEGORY_FOLD[rawCategory.toLowerCase()] ?? rawCategory;
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

    // ============================================================
    // Per-venue drilldown — one row per submission, expandable to
    // show every tool they picked (grouped by category) with the
    // matching NPS score if the operator rated that tool.
    //
    // Matching rules:
    //   1. NPS row belongs to a venue if EITHER:
    //      a) submission_id or external_id equals the business id, OR
    //      b) company name matches business_name (case/whitespace-insensitive).
    //      The company-name fallback catches rows written before the
    //      submission_id column was populated and any where the writer
    //      couldn't resolve the FK.
    //   2. Within a venue, an NPS row is attached to a tool if
    //      vendor.toLowerCase().trim() === tool_name.toLowerCase().trim().
    //   3. Overall NPS for a venue is the average of ALL attributed
    //      scores, whether they matched a tool or not — otherwise a
    //      venue with a naming mismatch reads as "no NPS" even though
    //      they clearly gave scores.
    //   4. Anything attributed to the venue that couldn't be pinned to
    //      a specific tool is surfaced separately as extraNps so it
    //      doesn't disappear.
    // ============================================================
    const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const npsByBusinessId = new Map<string, typeof npsAll>();
    for (const n of npsAll) {
      const key = n.submission_id || n.external_id;
      if (!key) continue;
      if (!npsByBusinessId.has(key)) npsByBusinessId.set(key, []);
      npsByBusinessId.get(key)!.push(n);
    }
    // Secondary index for the company-name fallback.
    const npsByCompanyName = new Map<string, typeof npsAll>();
    for (const n of npsAll) {
      const key = norm(n.company);
      if (!key) continue;
      if (!npsByCompanyName.has(key)) npsByCompanyName.set(key, []);
      npsByCompanyName.get(key)!.push(n);
    }

    // Group entries by submission for the drilldown build
    const entriesBySubmission = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!entriesBySubmission.has(e.submission_id)) entriesBySubmission.set(e.submission_id, []);
      entriesBySubmission.get(e.submission_id)!.push(e);
    }

    // CATEGORY_FOLD is declared earlier in the handler for the main
    // category aggregation — reused here for the per-venue drilldown so
    // both surfaces stay in sync.
    const venues: TechCheckVenueDrilldown[] = businesses
      .filter(b => (entriesBySubmission.get(b.id)?.length ?? 0) > 0)
      .map(b => {
        const bizEntries = entriesBySubmission.get(b.id)!;
        // Attribute NPS by id first, then fall back to matching on company name.
        // De-dupe by nps.id in case both paths return the same row.
        const byId = npsByBusinessId.get(b.id) || [];
        const byCompany = npsByCompanyName.get(norm(b.business_name)) || [];
        const seenNpsIds = new Set<string>();
        const bizNps: typeof npsAll = [];
        for (const n of [...byId, ...byCompany]) {
          if (seenNpsIds.has(n.id)) continue;
          seenNpsIds.add(n.id);
          bizNps.push(n);
        }

        // Group tools by category, attaching NPS where the vendor matches
        // the tool_name exactly (case + whitespace normalized).
        const usedNpsIds = new Set<string>();
        const byCategoryMap = new Map<string, Array<{ tool: string; nps: number | null; comment: string | null }>>();
        for (const e of bizEntries) {
          const rawCat = (e.category || '').trim();
          const cat = CATEGORY_FOLD[rawCat.toLowerCase()] ?? rawCat;
          const toolNorm = norm(e.tool_name);
          const npsMatch = bizNps.find(n => norm(n.vendor) === toolNorm);
          if (npsMatch) usedNpsIds.add(npsMatch.id);
          if (!byCategoryMap.has(cat)) byCategoryMap.set(cat, []);
          byCategoryMap.get(cat)!.push({
            tool: e.tool_name,
            nps: typeof npsMatch?.score === 'number' ? npsMatch.score : null,
            comment: npsMatch?.comment || null,
          });
        }

        // Sort categories alphabetically; tools within each category by name.
        const byCategory = Array.from(byCategoryMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, tools]) => ({
            category,
            tools: tools.slice().sort((a, b) => a.tool.localeCompare(b.tool)),
          }));

        // Extra NPS = attributed to this venue but not attached to any tool
        // (usually because the vendor name in the review differs from the
        // tool_name the operator picked in the form). Show separately so
        // the score isn't silently dropped.
        const extraNps = bizNps
          .filter(n => !usedNpsIds.has(n.id) && typeof n.score === 'number' && n.vendor)
          .map(n => ({
            vendor: n.vendor as string,
            category: n.category || null,
            score: n.score,
            comment: n.comment || null,
          }));

        // Overall NPS = mean of ALL scores attributed to this venue,
        // whether they matched a tool_name or not.
        const allScores = bizNps
          .map(n => n.score)
          .filter((s): s is number => typeof s === 'number');
        const avgNps = allScores.length
          ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
          : null;

        return {
          submissionId: b.id,
          businessName: b.business_name || 'Unknown',
          contactName: b.contact_name || null,
          contactEmail: b.contact_email || null,
          location: b.location || null,
          size: b.size || null,
          numberOfLocations: b.number_of_locations || null,
          industry: b.industry || null,
          vertical: b.vertical || null,
          biggestChallenge: b.biggest_challenge || null,
          createdAt: b.created_at || '',
          toolCount: bizEntries.length,
          npsCount: allScores.length,
          avgNps,
          recommendations: b.recommendations || null,
          byCategory,
          extraNps,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({
      whatsapp,
      knowledgeBase,
      categories,
      totalAnswers,
      totalVenues: totalVenues.size,
      totalCategories: categories.length,
      venues,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

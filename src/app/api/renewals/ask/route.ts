import OpenAI from 'openai';
import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { intelligenceFor, listTools } from '@/lib/renewals-db';
import {
  RENEWAL_CATEGORY_LABELS,
  deadlineFor,
  isRolling,
  monthlyCost,
  nextRenewal,
  todayISO,
} from '@/lib/renewals-shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Ask Renewals: a chat over the operator's own software, costs, contracts and
// Intelligence Review (how they rated each tool, their gaps, score and the
// AI-written report). The model only ever sees this one org's data, fetched
// here from the signed-in member's org — never anything the browser claims,
// and never any other venue or partner data.
//
// Neutral by design: it never recommends a named supplier. Stacked earns from
// suppliers, so an assistant that steered operators towards any of them would
// undo the reason operators trust this product.

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const MAX_TURNS = 12;
const MAX_CHARS = 2000;

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

function systemPrompt(orgName: string, today: string, context: string): string {
  return `You are Ask Renewals, the assistant inside Stacked Renewals, a free tool that helps UK hospitality operators understand their tech stack and track the software they pay for, what it costs and when each contract's notice period closes.

You are talking to someone from ${orgName}. Today is ${today}.

What you can do:
- Answer questions about their software, spend, renewals and notice deadlines, using ONLY the data below. Quote actual names, amounts and dates. If something isn't in the data, say so and suggest they add it (or upload the contract).
- Point out things worth acting on: deadlines coming up, tools missing a cost or renewal date, two tools in the same category that might overlap, contracts that have already rolled over.
- Draft a short, polite notice-of-cancellation or renegotiation email to a supplier when asked. Use placeholders like [your name] for anything you don't know. Remind them to check the contract for how notice must be served (e.g. in writing, to a specific address).
- Talk about their stack using their Intelligence Review (under "intelligence" in the data, if present): how they rated each tool (0–10, "ratings"), the categories where similar venues usually have a tool and they don't ("gaps"), their score out of 100 against similar venues, and the report we wrote for them ("report"). Low ratings plus an upcoming notice deadline is worth pointing out: that's the moment to review the tool. If they've changed tools since the review, the Renewals list is the current picture.
- Explain how to use Renewals: "Add tool" adds one by hand, "Upload a contract" reads a PDF and fills in the details for them to check, clicking a tool edits it, "Export CSV" downloads everything, the Team page adds colleagues and turns alert emails on or off. Alerts go out 60, 30, 14, 7 and 1 day before each notice deadline. Month-to-month contracts are treated as rolling and get no alerts.

Rules:
- Never recommend, rank or promote a specific supplier or product, even if asked which to switch to. Stacked is neutral. You can explain what to look for in a category or what questions to ask suppliers.
- You are not a lawyer. For contract interpretation, give your plain reading and say the contract wording is what counts.
- Money is GBP, excluding VAT. "Monthly equivalent" spreads annual costs over 12 months; one-off costs aren't counted.
- Be brief: 2–5 sentences, or a short list. Plain text only — no markdown headings, no bold, no tables. Use "- " for list items.

Their data (JSON):
${context}`;
}

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Ask Renewals is not switched on yet.' }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { messages?: unknown };
    const turns: Turn[] = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m): m is Turn =>
        Boolean(m) && typeof m === 'object' &&
        ((m as Turn).role === 'user' || (m as Turn).role === 'assistant') &&
        typeof (m as Turn).content === 'string' && (m as Turn).content.trim().length > 0
      )
      .slice(-MAX_TURNS)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!turns.length || turns[turns.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Ask a question' }, { status: 400 });
    }

    const today = todayISO();
    const [tools, intel] = await Promise.all([
      listTools(viewer.org.id),
      intelligenceFor(viewer.org).catch(() => null),
    ]);
    const monthly = tools.reduce((s, t) => s + monthlyCost(t), 0);
    const context = JSON.stringify({
      venue: viewer.org.name,
      sites: viewer.org.site_count,
      totals: {
        monthlySpend: Math.round(monthly * 100) / 100,
        annualRunRate: Math.round(monthly * 12 * 100) / 100,
        toolsTracked: tools.filter(t => t.status !== 'cancelled').length,
      },
      intelligence: intel ? {
        reviewedOn: intel.created_at.slice(0, 10),
        venueType: intel.venue_type,
        sites: intel.site_count,
        location: intel.location,
        score: intel.score,
        categoriesCoveredPct: intel.coverage_pct,
        gaps: intel.gap_categories || [],
        estimatedUpsideGbpPerYear: intel.total_gbp_per_year,
        estimatedHoursPerWeek: intel.total_hrs_per_week,
        ratings: intel.product_nps || {},
        stackAtReview: Object.fromEntries(Object.entries(intel.stack || {}).map(([cat, e]) => [
          cat,
          e?.none ? 'none' : [...(e?.tools || []), ...((e?.other || '').trim() ? [(e!.other || '').trim()] : [])],
        ])),
        report: (intel.ai_feedback || '').slice(0, 6000) || null,
      } : null,
      tools: tools.map(t => {
        const d = deadlineFor(t, today);
        return {
          name: t.name,
          supplier: t.supplier,
          category: RENEWAL_CATEGORY_LABELS[t.category],
          sites: t.sites,
          cost: t.cost_amount,
          per: t.cost_period,
          monthlyEquivalent: Math.round(monthlyCost(t) * 100) / 100,
          contractStart: t.contract_start,
          termMonths: t.term_months,
          rollingMonthly: isRolling(t),
          nextRenewal: nextRenewal(t, today),
          noticeDays: t.notice_days,
          autoRenews: t.auto_renew,
          giveNoticeBy: d?.date ?? null,
          daysUntilNoticeDeadline: d?.days ?? null,
          status: t.status,
          owner: t.owner,
          notes: t.notes,
          contractOnFile: t.has_contract,
        };
      }),
    });

    const completion = await openai().chat.completions.create({
      model: process.env.RENEWALS_ASK_MODEL || 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [{ role: 'system', content: systemPrompt(viewer.org.name, today, context) }, ...turns],
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    return NextResponse.json({ answer: answer || "Sorry, I couldn't come up with an answer. Try asking another way." });
  } catch (err) {
    return failed('ask', err, "Ask Renewals couldn't answer just now. Try again.");
  }
}

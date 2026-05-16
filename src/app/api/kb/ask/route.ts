import { NextResponse, type NextRequest } from 'next/server';
import OpenAI from 'openai';
import { listKnowledgeEntries } from '@/lib/knowledge';

// Internal only — gated by the auth proxy (not in PUBLIC_PREFIXES).

export const dynamic = 'force-dynamic';

// Lazy-init so a missing OPENAI_API_KEY returns clean JSON instead of
// crashing the route module on import.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Per-entry content cap so a few huge pages don't blow the token budget.
const PER_ENTRY_CHARS = 4_000;
const MAX_ENTRIES_IN_CONTEXT = 60;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI is not configured' }, { status: 503 });
    }

    const { question } = (await request.json().catch(() => ({}))) as { question?: string };
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'A question is required' }, { status: 400 });
    }

    const entries = await listKnowledgeEntries();
    if (entries.length === 0) {
      return NextResponse.json({
        answer: 'The knowledge base is empty — add some links first.',
        sources: [],
      });
    }

    // Newest first; cap how many we feed the model.
    const used = entries.slice(0, MAX_ENTRIES_IN_CONTEXT);

    const context = used
      .map((e, i) => {
        const parts = [
          `[${i + 1}] ${e.title || e.url}`,
          `URL: ${e.url}`,
          e.notes ? `Notes: ${e.notes}` : null,
          e.content
            ? `Content: ${e.content.slice(0, PER_ENTRY_CHARS)}`
            : `Content: (not retrievable — ${e.fetch_error || 'no text'}; rely on title/notes)`,
        ].filter(Boolean);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the knowledge-base assistant for Tech on Toast's internal team.

Answer the question using ONLY the sources below. Each source is numbered [n]
with its title, URL, optional notes, and extracted page content.

Rules:
- Be concise and specific. Use bullet points for lists.
- Cite the sources you used by their number, e.g. "(see [2])".
- If the answer isn't in the sources, say so plainly — do not invent.
- Some sources couldn't be fetched (login-walled etc.); use their title/notes.

Sources:
${context}`,
        },
        { role: 'user', content: question },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });

    const answer =
      completion.choices[0]?.message?.content || "Sorry, I couldn't generate an answer.";

    return NextResponse.json({
      answer,
      sources: used.map((e, i) => ({
        n: i + 1,
        title: e.title || e.url,
        url: e.url,
      })),
    });
  } catch (error: any) {
    console.error('KB ask error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to answer' },
      { status: 500 }
    );
  }
}

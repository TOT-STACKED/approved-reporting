import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { VisitInputError, cleanVisitInput, createVisit, listVisits } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Agents get their own visits; managers get everyone's, optionally filtered.
export async function GET(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  const p = request.nextUrl.searchParams;
  const visits = await listVisits({
    agentId: agent.role === 'manager' ? p.get('agent') || undefined : agent.id,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
    limit: Number(p.get('limit')) || undefined,
  });
  return NextResponse.json({ visits });
}

export async function POST(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = await createVisit(agent.id, cleanVisitInput(body, agent.id));
    return NextResponse.json({ id });
  } catch (error: unknown) {
    if (error instanceof VisitInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] create visit failed', error);
    return NextResponse.json({ error: "Couldn't save the visit. Try again." }, { status: 500 });
  }
}

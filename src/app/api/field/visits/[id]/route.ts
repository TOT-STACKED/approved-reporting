import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { VisitInputError, canAccess, cleanVisitInput, deleteVisit, getVisit, updateVisit } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Edit a visit. Agents can edit their own; managers can edit any. Photos are
// checked against the visit owner's folder, so a manager's edit keeps them.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;
  const { id } = await params;

  const visit = await getVisit(id);
  if (!visit || !canAccess(agent, visit)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Keep the original visit time unless the edit sets one.
    await updateVisit(id, cleanVisitInput({ visited_at: visit.visited_at, ...body }, visit.agent_id));
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof VisitInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] update visit failed', error);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;
  const { id } = await params;

  const visit = await getVisit(id);
  if (!visit || !canAccess(agent, visit)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteVisit(id);
  return NextResponse.json({ ok: true });
}

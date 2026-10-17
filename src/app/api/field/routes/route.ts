import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { listAgents } from '@/lib/field-db';
import { RouteInputError, cleanRouteInput, createRoute, listRoutes } from '@/lib/field-routes';

export const dynamic = 'force-dynamic';

// Agents get their own routes; managers everyone's, or one agent's.
export async function GET(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const p = request.nextUrl.searchParams;
  const routes = await listRoutes({
    agentId: me.role === 'manager' ? p.get('agent') || undefined : me.id,
    from: p.get('from') || undefined,
  });
  return NextResponse.json({ routes });
}

export async function POST(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Managers can plan for anyone on the team; agents only for themselves.
    let agentId = me.id;
    if (me.role === 'manager' && typeof body.agent_id === 'string' && body.agent_id !== me.id) {
      const target = (await listAgents()).find(a => a.id === body.agent_id && a.active);
      if (!target) return NextResponse.json({ error: 'Pick who the route is for' }, { status: 400 });
      agentId = target.id;
    }
    const id = await createRoute(agentId, me.id, cleanRouteInput(body));
    return NextResponse.json({ id });
  } catch (error: unknown) {
    if (error instanceof RouteInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] create route failed', error);
    return NextResponse.json({ error: "Couldn't save the route. Try again." }, { status: 500 });
  }
}

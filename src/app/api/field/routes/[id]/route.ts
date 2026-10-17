import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { listAgents } from '@/lib/field-db';
import { RouteInputError, canAccessRoute, cleanRouteInput, deleteRoute, getRoute, updateRoute } from '@/lib/field-routes';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const { id } = await params;
  const route = await getRoute(id);
  if (!route || !canAccessRoute(me, route)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fields = cleanRouteInput(body);
    if (me.role === 'manager' && typeof body.agent_id === 'string' && body.agent_id !== route.agent_id) {
      const target = (await listAgents()).find(a => a.id === body.agent_id && a.active);
      if (target) fields.agent_id = target.id;
    }
    await updateRoute(id, fields);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof RouteInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] update route failed', error);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const { id } = await params;
  const route = await getRoute(id);
  if (!route || !canAccessRoute(me, route)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteRoute(id);
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { AgentInputError, addAgent, listAgents, updateAgent } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Managers add, rename, promote and switch off agents.
export async function GET() {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  return NextResponse.json({ agents: await listAgents() });
}

export async function POST(request: NextRequest) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  try {
    const { email, name, role } = (await request.json().catch(() => ({}))) as { email?: string; name?: string; role?: string };
    const agent = await addAgent(email || '', (name || '').trim().slice(0, 100), role === 'manager' ? 'manager' : 'agent');
    return NextResponse.json({ agent });
  } catch (error: unknown) {
    if (error instanceof AgentInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] add agent failed', error);
    return NextResponse.json({ error: "Couldn't add them. Try again." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  const { id, active, role, name } = (await request.json().catch(() => ({}))) as {
    id?: string; active?: boolean; role?: 'agent' | 'manager'; name?: string;
  };
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'No agent' }, { status: 400 });
  // A manager can't lock themselves out.
  if (id === me.id && (active === false || role === 'agent')) {
    return NextResponse.json({ error: "You can't remove or demote yourself." }, { status: 400 });
  }
  await updateAgent(id, { active, role, name });
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { listAgents } from '@/lib/field-db';
import { importIntelligenceBatch } from '@/lib/field-import';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

// Managers only. Imports one batch of Intelligence Reviews as back-dated
// visits for the chosen agent; the Team page calls it in a loop until
// `remaining` is 0.
export async function POST(request: NextRequest) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;

  const { agent } = (await request.json().catch(() => ({}))) as { agent?: string };
  const target = agent && /^[0-9a-f-]{36}$/.test(agent)
    ? (await listAgents()).find(a => a.id === agent)
    : null;
  if (!target) return NextResponse.json({ error: 'Pick who the history belongs to.' }, { status: 400 });

  try {
    const result = await importIntelligenceBatch(target.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.warn('[field] import failed', error);
    return NextResponse.json({ error: 'The import stopped. Press it again to carry on.' }, { status: 500 });
  }
}

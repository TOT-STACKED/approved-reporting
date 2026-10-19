import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { TargetInputError, deleteTargetList, syncSource } from '@/lib/field-targets';

export const dynamic = 'force-dynamic';

export const maxDuration = 26;

// Managers: load one brand's venues into the list (the Team page calls this
// once per brand on the list).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  const { id } = await params;
  try {
    const { source, last } = (await request.json().catch(() => ({}))) as { source?: string; last?: boolean };
    const saved = await syncSource(id, String(source || ''), last === true);
    return NextResponse.json({ saved });
  } catch (error: unknown) {
    if (error instanceof TargetInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] save targets failed', error);
    return NextResponse.json({ error: "Couldn't save those venues. Try again." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'No such list' }, { status: 404 });
  await deleteTargetList(id);
  return NextResponse.json({ ok: true });
}

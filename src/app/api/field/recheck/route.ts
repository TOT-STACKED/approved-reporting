import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { recheckBatch } from '@/lib/field-import';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

// Managers only. Re-places one batch of approximate imported pins; the Team
// page calls it in a loop, passing back `last`, until `done`.
export async function POST(request: NextRequest) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  const { after } = (await request.json().catch(() => ({}))) as { after?: string };
  try {
    return NextResponse.json(await recheckBatch(typeof after === 'string' && /^[0-9a-f-]{36}$/.test(after) ? after : ''));
  } catch (error: unknown) {
    console.warn('[field] recheck failed', error);
    return NextResponse.json({ error: 'The re-check stopped. Press it again to carry on.' }, { status: 500 });
  }
}

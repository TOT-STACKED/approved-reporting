import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { TargetInputError, cleanSources, createTargetList, listTargetLists, searchSources } from '@/lib/field-targets';

export const dynamic = 'force-dynamic';

// Target lists: everyone can see them; managers add them.
// ?q=toby → brands All The Places covers, for "find another brand".
export async function GET(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const q = request.nextUrl.searchParams.get('q');
  if (q != null) {
    const sources = await searchSources(q).catch(() => null);
    return sources ? NextResponse.json({ sources }) : NextResponse.json({ error: 'The brand list isn’t answering. Try again.' }, { status: 502 });
  }
  return NextResponse.json({ lists: await listTargetLists() });
}

export async function POST(request: NextRequest) {
  const me = await requireAgent({ manager: true });
  if (me instanceof NextResponse) return me;
  try {
    const { name, sources } = (await request.json().catch(() => ({}))) as { name?: string; sources?: unknown };
    const id = await createTargetList(String(name || ''), cleanSources(sources), me.id);
    return NextResponse.json({ id });
  } catch (error: unknown) {
    if (error instanceof TargetInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn('[field] create target list failed', error);
    return NextResponse.json({ error: "Couldn't add the list. Try again." }, { status: 500 });
  }
}

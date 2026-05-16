import { NextResponse, type NextRequest } from 'next/server';
import {
  addKnowledgeEntry,
  listKnowledgeEntries,
  deleteKnowledgeEntry,
} from '@/lib/knowledge';

// Internal only — not in the proxy's PUBLIC_PREFIXES, so the auth gate
// protects every method here automatically.

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entries = await listKnowledgeEntries();
    return NextResponse.json({ entries, total: entries.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      notes?: string;
      title?: string;
    };
    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'A URL is required' }, { status: 400 });
    }
    const entry = await addKnowledgeEntry({
      url: body.url,
      notes: body.notes,
      title: body.title,
    });
    return NextResponse.json({ entry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to add link' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await deleteKnowledgeEntry(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
  }
}

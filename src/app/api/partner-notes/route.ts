import { NextResponse, type NextRequest } from 'next/server';
import { rest, fieldConfigured } from '@/lib/field-db';
import { canonicalPartnerSlug } from '@/lib/airtable';

// Team notes on partners for the internal dashboard. Team-session gated by
// src/proxy.ts (not in PUBLIC_PREFIXES) and never read by the partner-facing
// /p or /api/p routes. Table: portal_partner_notes (migration 012).

export const dynamic = 'force-dynamic';

const TABLE = 'portal_partner_notes';
const COLS = 'id,slug,body,author,is_action,created_at,done_at,done_by';

export interface PartnerNote {
  id: string;
  slug: string;
  body: string;
  author: string | null;
  is_action: boolean;
  created_at: string;
  done_at: string | null;
  done_by: string | null;
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

// Open notes plus anything closed in the last 30 days, newest first.
export async function GET() {
  if (!fieldConfigured()) return NextResponse.json({ notes: [], saved: false });
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const notes = await rest<PartnerNote[]>(
      `${TABLE}?select=${COLS}&or=(done_at.is.null,done_at.gte.${encodeURIComponent(since)})&order=created_at.desc&limit=1000`
    );
    return NextResponse.json({ notes, saved: true });
  } catch (e) {
    console.warn('[partner-notes]', e instanceof Error ? e.message : e);
    return NextResponse.json({ notes: [], saved: false });
  }
}

// Add a note: { slug, body, author?, isAction? }
export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const slug = clean(b.slug, 200);
  const body = clean(b.body, 2000);
  if (!slug || !body) return NextResponse.json({ error: 'slug and body are required' }, { status: 400 });
  try {
    const [note] = await rest<PartnerNote[]>(`${TABLE}?select=${COLS}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        slug: canonicalPartnerSlug(slug),
        body,
        author: clean(b.author, 80),
        is_action: b.isAction === true,
      }),
    });
    return NextResponse.json({ note });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown error' }, { status: 500 });
  }
}

// Mark done / reopen: { id, done: boolean, by? }
export async function PATCH(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const id = clean(b.id, 64);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || typeof b.done !== 'boolean') {
    return NextResponse.json({ error: 'id and done are required' }, { status: 400 });
  }
  try {
    const [note] = await rest<PartnerNote[]>(`${TABLE}?id=eq.${id}&select=${COLS}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(b.done
        ? { done_at: new Date().toISOString(), done_by: clean(b.by, 80) }
        : { done_at: null, done_by: null }),
    });
    return NextResponse.json({ note });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown error' }, { status: 500 });
  }
}

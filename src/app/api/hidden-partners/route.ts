import { NextResponse, type NextRequest } from 'next/server';
import { rest, fieldConfigured } from '@/lib/field-db';
import { canonicalPartnerSlug } from '@/lib/airtable';

// Partners hidden from the internal dashboard, saved for the whole team.
// Team-session gated by src/proxy.ts (not in PUBLIC_PREFIXES).
// Table: portal_hidden_partners (supabase/migrations/011).

export const dynamic = 'force-dynamic';

interface HiddenRow {
  slug: string;
  name: string | null;
  hidden_at: string;
}

const TABLE = 'portal_hidden_partners';

export async function GET() {
  if (!fieldConfigured()) return NextResponse.json({ hidden: [], saved: false });
  try {
    const rows = await rest<HiddenRow[]>(`${TABLE}?select=slug,name,hidden_at&order=hidden_at.desc`);
    return NextResponse.json({ hidden: rows, saved: true });
  } catch (e) {
    // Table not created yet (migration 011 not applied) — the page falls
    // back to this browser's own list rather than breaking.
    console.warn('[hidden-partners]', e instanceof Error ? e.message : e);
    return NextResponse.json({ hidden: [], saved: false });
  }
}

// { slug, name?, hidden: boolean }
export async function POST(request: NextRequest) {
  let body: { slug?: unknown; name?: unknown; hidden?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (typeof body.slug !== 'string' || !body.slug.trim() || typeof body.hidden !== 'boolean') {
    return NextResponse.json({ error: 'slug and hidden are required' }, { status: 400 });
  }
  const slug = canonicalPartnerSlug(body.slug);
  const name = typeof body.name === 'string' ? body.name.slice(0, 200) : null;

  try {
    if (body.hidden) {
      await rest(`${TABLE}?on_conflict=slug`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ slug, name, hidden_at: new Date().toISOString() }),
      });
    } else {
      await rest(`${TABLE}?slug=eq.${encodeURIComponent(slug)}`, { method: 'DELETE' });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

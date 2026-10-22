import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { resolveWithSuggestions } from '@/lib/field-resolve';
import { venuesFromNotes } from '@/lib/field-notes-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

// Two jobs:
//   { notes }  → the venues in a route's notes, as "Name, where" lines (AI;
//               falls back to the notes' own lines)
//   { lines }  → each line resolved to a place. Up to 4 a call; the route
//               planner sends the rest in further calls.
export async function POST(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { notes?: unknown; lines?: unknown; lat?: number; lng?: number };

  if (typeof body.notes === 'string') {
    const found = await venuesFromNotes(body.notes).catch(e => { console.warn('[field] notes AI failed', e); return null; });
    const lines = found
      ? found.map(v => [v.name, v.where].filter(Boolean).join(', '))
      : body.notes.split(/\n|;/).map(l => l.trim()).filter(l => l.replace(/[^a-z0-9]/gi, '').length >= 3);
    return NextResponse.json({ lines, ai: Boolean(found) });
  }

  const list = (Array.isArray(body.lines) ? body.lines : []).map(l => String(l).trim().slice(0, 200)).filter(Boolean).slice(0, 4);
  const near = { lat: Number(body.lat) || 51.5074, lng: Number(body.lng) || -0.1278 };
  const out = await Promise.all(list.map(line => resolveWithSuggestions(line, near).catch(() => ({ place: null, suggestions: [] }))));
  return NextResponse.json({ results: list.map((line, i) => ({ line, ...out[i] })) });
}

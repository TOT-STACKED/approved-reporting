import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { resolveLine } from '@/lib/field-resolve';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

// Turn lines of text (a route's notes, or "add it anyway") into places. Up to
// 8 lines a call (about 2-6 s); the route planner sends the rest in further calls.
export async function POST(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const { lines, lat, lng } = (await request.json().catch(() => ({}))) as { lines?: unknown; lat?: number; lng?: number };
  const list = (Array.isArray(lines) ? lines : []).map(l => String(l).trim().slice(0, 200)).filter(Boolean).slice(0, 8);
  const near = { lat: Number(lat) || 51.5074, lng: Number(lng) || -0.1278 };
  // Three lines at a time: the free lookups refuse bigger bursts.
  const places: Awaited<ReturnType<typeof resolveLine>>[] = [];
  for (let i = 0; i < list.length; i += 3) {
    places.push(...(await Promise.all(list.slice(i, i + 3).map(line => resolveLine(line, near).catch(() => null)))));
  }
  return NextResponse.json({ results: list.map((line, i) => ({ line, place: places[i] })) });
}

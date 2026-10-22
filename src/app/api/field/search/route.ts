import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { searchPlaces } from '@/lib/field-resolve';

export const dynamic = 'force-dynamic';

// "Find a venue": known venues, brand targets, the map, then the postcode
// typed (see field-resolve.ts), nearest to `lat`/`lng` (London by default).
export async function GET(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const p = request.nextUrl.searchParams;
  const q = (p.get('q') || '').trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const near = { lat: Number(p.get('lat')) || 51.5074, lng: Number(p.get('lng')) || -0.1278 };
  return NextResponse.json({ results: await searchPlaces(q, near).catch(() => []) });
}

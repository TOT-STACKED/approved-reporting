import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { lastVisits, nearbyPlaces } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Venues around the agent's phone, for the "which venue are you in?" list.
// Each place says whether the team has visited it before.
export async function GET(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  // ?refs=a,b,c — when the phone found places itself (Google), just say which were visited before.
  const refs = request.nextUrl.searchParams.get('refs');
  if (refs != null) {
    return NextResponse.json({ history: await lastVisits(refs.split(',')).catch(() => ({})) });
  }

  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lng = Number(request.nextUrl.searchParams.get('lng'));
  const radius = Number(request.nextUrl.searchParams.get('r')) || 150;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'No location' }, { status: 400 });
  }

  try {
    const places = await nearbyPlaces(lat, lng, radius);
    const history = await lastVisits(places.map(p => p.ref)).catch(() => ({} as Record<string, string>));
    return NextResponse.json({ places: places.map(p => ({ ...p, last_visit: history[p.ref] ?? null })) });
  } catch (error: unknown) {
    console.warn('[field] nearby failed', error);
    // The app falls back to a dropped pin, so this is soft.
    return NextResponse.json({ places: [], error: "Couldn't load nearby venues. Drop a pin instead." });
  }
}

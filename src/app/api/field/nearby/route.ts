import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { nearbyPlaces, visitsToPlace } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Venues around the agent's phone, for the "which venue are you in?" list.
// Each place says whether the team has visited it before.
export async function GET(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lng = Number(request.nextUrl.searchParams.get('lng'));
  const radius = Number(request.nextUrl.searchParams.get('r')) || 150;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'No location' }, { status: 400 });
  }

  try {
    const places = await nearbyPlaces(lat, lng, radius);
    const withHistory = await Promise.all(places.slice(0, 15).map(async p => ({
      ...p,
      last_visit: (await visitsToPlace(p.ref).catch(() => []))[0]?.visited_at ?? null,
    })));
    return NextResponse.json({ places: [...withHistory, ...places.slice(15).map(p => ({ ...p, last_visit: null }))] });
  } catch (error: unknown) {
    console.warn('[field] nearby failed', error);
    // The app falls back to a dropped pin, so this is soft.
    return NextResponse.json({ places: [], error: "Couldn't load nearby venues. Drop a pin instead." });
  }
}

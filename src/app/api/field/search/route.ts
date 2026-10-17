import { NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { allRows } from '@/lib/field-db';
import { distanceM } from '@/lib/field-shared';

export const dynamic = 'force-dynamic';

interface Result { name: string; address: string; postcode: string; lat: number; lng: number; ref: string | null; known: boolean }

// "Add a stop" search: venues the team already knows (visits and imported
// reviews) first, then OpenStreetMap places via Photon, nearest to `near`.
export async function GET(request: NextRequest) {
  const me = await requireAgent();
  if (me instanceof NextResponse) return me;
  const p = request.nextUrl.searchParams;
  const q = (p.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const lat = Number(p.get('lat')) || 51.5074;
  const lng = Number(p.get('lng')) || -0.1278;

  const like = `*${q.replace(/[*,()]/g, ' ')}*`;
  const [known, photon] = await Promise.all([
    allRows<{ id: string; venue_name: string; address: string | null; postcode: string | null; lat: number | null; lng: number | null; osm_ref: string | null }>(
      `field_visits?venue_name=ilike.${encodeURIComponent(like)}&lat=not.is.null&select=id,venue_name,address,postcode,lat,lng,osm_ref&order=visited_at.desc`, 200,
    ).catch(() => []),
    fetch(`https://photon.komoot.io/api?${new URLSearchParams({ q, limit: '8', lang: 'en', lat: String(lat), lon: String(lng), bbox: '-8.7,49.8,1.9,60.9' })}`, {
      headers: { 'User-Agent': 'StackedField/1.0 (partners.wearestacked.io)' },
      signal: AbortSignal.timeout(5000),
    }).then(r => (r.ok ? r.json() : { features: [] })).catch(() => ({ features: [] })),
  ]);

  const seen = new Set<string>();
  const results: Result[] = [];
  for (const v of known) {
    const key = `${v.venue_name.toLowerCase()}|${v.lat!.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name: v.venue_name, address: v.address || '', postcode: v.postcode || '', lat: v.lat!, lng: v.lng!, ref: v.osm_ref || `visit/${v.id}`, known: true });
  }
  type F = { geometry: { coordinates: [number, number] }; properties: { osm_type?: string; osm_id?: number; name?: string; housenumber?: string; street?: string; city?: string; district?: string; postcode?: string } };
  for (const f of (photon.features || []) as F[]) {
    const pr = f.properties;
    if (!pr.name) continue;
    const [fLng, fLat] = f.geometry.coordinates;
    const types: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
    results.push({
      name: pr.name,
      address: [[pr.housenumber, pr.street].filter(Boolean).join(' '), pr.district || pr.city].filter(Boolean).join(', '),
      postcode: pr.postcode || '',
      lat: fLat,
      lng: fLng,
      ref: pr.osm_type && pr.osm_id ? `${types[pr.osm_type]}/${pr.osm_id}` : null,
      known: false,
    });
  }
  results.sort((a, b) => Number(b.known) - Number(a.known) || distanceM(lat, lng, a.lat, a.lng) - distanceM(lat, lng, b.lat, b.lng));
  return NextResponse.json({ results: results.slice(0, 20) });
}

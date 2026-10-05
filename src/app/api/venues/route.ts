import { NextResponse, type NextRequest } from 'next/server';
import { listVenues } from '@/lib/venues';
import { summarise, viewerEntitlement } from '@/lib/venue-viewer';
import { VENUE_SESSION_COOKIE, verifyVenueSession } from '@/lib/venue-auth';

export const dynamic = 'force-dynamic';

// The marketplace listing. Anonymous visitors get anonymised cards; signed-in
// subscribers get the same, plus name and stack on the venues they've revealed.
// All shaping happens in listVenues — this route just passes the viewer in.
export async function GET(request: NextRequest) {
  try {
    const ent = await viewerEntitlement(request);
    const p = request.nextUrl.searchParams;
    const { venues, total } = await listVenues(ent, {
      type: p.get('type') || undefined,
      q: p.get('q') || undefined,
      tool: p.get('tool') || undefined,
      unhappy: p.get('unhappy') === '1',
      revealedOnly: p.get('revealed') === '1',
    });
    // Signed in but nothing to show (lapsed, or a Promote partner): say so,
    // rather than showing the anonymous page with a "Sign in" button.
    const signedInAs = ent ? null : verifyVenueSession(request.cookies.get(VENUE_SESSION_COOKIE)?.value)?.email || null;
    return NextResponse.json({ viewer: ent ? summarise(ent) : null, signedInAs, venues, total });
  } catch (error: unknown) {
    console.warn('[venues] list failed', error);
    return NextResponse.json({ error: 'The venue list is unavailable right now.' }, { status: 503 });
  }
}

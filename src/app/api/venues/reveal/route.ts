import { NextResponse, type NextRequest } from 'next/server';
import { venueById } from '@/lib/venues';
import { recordReveal } from '@/lib/venue-subscribers';
import { viewerEntitlement } from '@/lib/venue-viewer';

export const dynamic = 'force-dynamic';

// Spend one of the month's reveals on a venue. Revealing something already
// revealed is free and just says ok.
export async function POST(request: NextRequest) {
  try {
    const ent = await viewerEntitlement(request);
    if (!ent) return NextResponse.json({ error: 'Sign in with your Promote partner email to reveal venues.' }, { status: 401 });
    if (!ent.categories.length) {
      return NextResponse.json({ error: 'Pick this month’s categories first.', needsCategories: true }, { status: 409 });
    }

    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Missing venue' }, { status: 400 });

    if (ent.revealed.has(id)) return NextResponse.json({ ok: true, already: true });

    const venue = await venueById(id);
    if (!venue) return NextResponse.json({ error: 'That venue is no longer listed.' }, { status: 404 });

    if (ent.used >= ent.allowance) {
      return NextResponse.json(
        { error: 'You’ve used this month’s reveals. You get 5 more on the 1st.', outOfReveals: true },
        { status: 402 }
      );
    }

    await recordReveal({ email: ent.email, venueId: venue.id, venueName: venue.name });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.warn('[venues] reveal failed', error);
    return NextResponse.json({ error: 'Could not reveal that venue. Try again.' }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { venueById } from '@/lib/venues';
import { recordReveal, updateSubscriber } from '@/lib/venue-subscribers';
import { viewerEntitlement } from '@/lib/venue-viewer';

export const dynamic = 'force-dynamic';

// Spend one reveal on a venue. Plan allowance first, then bonus reveals from
// top-ups. Revealing something already revealed is free and just says ok.
export async function POST(request: NextRequest) {
  try {
    const ent = await viewerEntitlement(request);
    if (!ent) return NextResponse.json({ error: 'Sign in to reveal venues.' }, { status: 401 });
    if (ent.status === 'past_due') {
      return NextResponse.json(
        { error: 'Your last payment didn’t go through. Update your card to keep revealing.' },
        { status: 402 }
      );
    }

    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Missing venue' }, { status: 400 });

    if (ent.revealed.has(id)) return NextResponse.json({ ok: true, already: true });

    const venue = await venueById(id);
    if (!venue) return NextResponse.json({ error: 'That venue is no longer listed.' }, { status: 404 });

    let usedBonus = false;
    if (ent.used >= ent.allowance) {
      if (ent.bonus <= 0 || !ent.subscriberId) {
        return NextResponse.json(
          { error: 'You’ve used this month’s reveals.', outOfReveals: true },
          { status: 402 }
        );
      }
      usedBonus = true;
      await updateSubscriber(ent.subscriberId, { bonus: ent.bonus - 1 });
    }

    await recordReveal({ email: ent.email, venueId: venue.id, venueName: venue.name, usedBonus });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.warn('[venues] reveal failed', error);
    return NextResponse.json({ error: 'Could not reveal that venue. Try again.' }, { status: 500 });
  }
}

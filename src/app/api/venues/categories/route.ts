import { NextResponse, type NextRequest } from 'next/server';
import { CATEGORIES, PROMOTE, isCategory } from '@/lib/venue-plans';
import { saveCategories } from '@/lib/venue-subscribers';
import { viewerEntitlement } from '@/lib/venue-viewer';

export const dynamic = 'force-dynamic';

// This month's category pick. Up to five, chosen once a month: the pick is
// what the month's reveals show, so changing it mid-month would let five
// reveals read every category in turn. It resets on the 1st.
export async function POST(request: NextRequest) {
  try {
    const ent = await viewerEntitlement(request);
    if (!ent) return NextResponse.json({ error: 'Sign in with your Promote partner email.' }, { status: 401 });
    if (ent.categories.length) {
      return NextResponse.json(
        { error: 'You’ve already picked this month’s categories. You can pick again on the 1st.' },
        { status: 409 }
      );
    }

    const { categories } = (await request.json().catch(() => ({}))) as { categories?: unknown[] };
    // Dedupe and keep the canonical order.
    const picked = CATEGORIES.filter(c => (categories || []).filter(isCategory).includes(c));
    if (!picked.length) return NextResponse.json({ error: 'Pick at least one category.' }, { status: 400 });
    if (picked.length > PROMOTE.maxCategories) {
      return NextResponse.json({ error: `Pick up to ${PROMOTE.maxCategories} categories.` }, { status: 400 });
    }

    await saveCategories(ent, picked);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.warn('[venues] categories failed', error);
    return NextResponse.json({ error: 'Could not save your categories. Try again.' }, { status: 500 });
  }
}

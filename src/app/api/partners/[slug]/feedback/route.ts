import { NextResponse } from 'next/server';
import { listFeedbackForPartner } from '@/lib/feedback';

// Internal — auto-gated by the auth proxy (not in PUBLIC_PREFIXES).
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const feedback = await listFeedbackForPartner(slug);
    return NextResponse.json({ feedback, total: feedback.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load feedback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { proposalLink } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

// Opens a proposal's PDF through a one-minute signed link. The bucket is private.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  try {
    const link = await proposalLink(viewer.org.id, id);
    if (!link) return NextResponse.json({ error: 'No file on this proposal' }, { status: 404 });
    return NextResponse.redirect(link);
  } catch (err) {
    return failed('open proposal', err);
  }
}

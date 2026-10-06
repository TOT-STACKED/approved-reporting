import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { contractLink } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

// Opens a tool's contract through a one-minute signed link. The bucket is
// private; this is the only way out of it.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  try {
    const link = await contractLink(viewer.org.id, id);
    if (!link) return NextResponse.json({ error: 'No contract on file' }, { status: 404 });
    return NextResponse.redirect(link);
  } catch (err) {
    return failed('open contract', err);
  }
}

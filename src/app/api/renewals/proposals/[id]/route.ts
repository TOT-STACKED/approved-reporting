import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { ToolInputError, cleanProposalInput, deleteProposal, updateProposal } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const proposal = await updateProposal(viewer.org.id, id, await cleanProposalInput(viewer.org.id, body));
    if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ proposal });
  } catch (err) {
    if (err instanceof ToolInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return failed('update proposal', err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  try {
    await deleteProposal(viewer.org.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed('delete proposal', err);
  }
}

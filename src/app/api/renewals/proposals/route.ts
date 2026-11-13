import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { ToolInputError, cleanProposalInput, createProposal, listProposals, ownsProposalPath } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    return NextResponse.json({ proposals: await listProposals(viewer.org.id) });
  } catch (err) {
    return failed('list proposals', err);
  }
}

// Save a proposal. When it came from an upload, the file path must be one the
// extract route issued for this org.
export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fields = await cleanProposalInput(viewer.org.id, body);
    const extra = ownsProposalPath(viewer.org.id, body.file_path)
      ? { file_path: body.file_path, file_name: String(body.file_name || 'proposal.pdf').slice(0, 200) }
      : {};
    return NextResponse.json({ proposal: await createProposal(viewer.org.id, fields, extra) });
  } catch (err) {
    if (err instanceof ToolInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return failed('create proposal', err);
  }
}

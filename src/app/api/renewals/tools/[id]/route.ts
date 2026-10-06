import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { ToolInputError, attachContract, cleanToolInput, deleteTool, ownsContractPath, updateTool } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    let tool = await updateTool(viewer.org.id, id, cleanToolInput(body, true));
    if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (ownsContractPath(viewer.org.id, body.contract_path)) {
      tool = (await attachContract(viewer.org.id, id, body.contract_path as string, String(body.contract_name || 'contract.pdf'))) || tool;
    }
    return NextResponse.json({ tool });
  } catch (err) {
    if (err instanceof ToolInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return failed('update tool', err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  try {
    await deleteTool(viewer.org.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed('delete tool', err);
  }
}

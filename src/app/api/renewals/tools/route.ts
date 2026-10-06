import { NextResponse, type NextRequest } from 'next/server';
import { failed, requireViewer } from '@/lib/renewals-api';
import { ToolInputError, attachContract, cleanToolInput, createTool, listTools, ownsContractPath } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    return NextResponse.json({ tools: await listTools(viewer.org.id) });
  } catch (err) {
    return failed('list tools', err);
  }
}

export async function POST(request: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fields = cleanToolInput(body, false);
    const fromUpload = ownsContractPath(viewer.org.id, body.contract_path);
    let tool = await createTool(viewer.org.id, fields, { source: fromUpload ? 'upload' : 'manual' });
    if (fromUpload) {
      tool = (await attachContract(viewer.org.id, tool.id, body.contract_path as string, String(body.contract_name || 'contract.pdf'))) || tool;
    }
    return NextResponse.json({ tool });
  } catch (err) {
    if (err instanceof ToolInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return failed('create tool', err);
  }
}

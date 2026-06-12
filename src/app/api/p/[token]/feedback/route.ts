import { NextResponse, type NextRequest } from 'next/server';
import { FEEDBACK_STATUS_OPTIONS, insertFeedback } from '@/lib/feedback';

// Partner-facing. The token in the URL is the credential; we resolve it to
// a partner_slug via PARTNER_TOKENS before writing.
// Sits under /api/p/ so it's already in the proxy's PUBLIC_PREFIXES.

export const dynamic = 'force-dynamic';

function getTokenMap(): Record<string, string> {
  try { return JSON.parse(process.env.PARTNER_TOKENS || '{}'); } catch { return {}; }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenMap = getTokenMap();
    const partnerSlug = tokenMap[token];
    if (!partnerSlug) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      leadId?: string;
      leadBusinessName?: string;
      reportedStatus?: string;
      comment?: string;
    };

    if (!body.leadId || typeof body.leadId !== 'string') {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }
    if (!body.reportedStatus || typeof body.reportedStatus !== 'string') {
      return NextResponse.json({ error: 'reportedStatus is required' }, { status: 400 });
    }
    if (!FEEDBACK_STATUS_OPTIONS.includes(body.reportedStatus as never)) {
      return NextResponse.json(
        { error: `reportedStatus must be one of: ${FEEDBACK_STATUS_OPTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const saved = await insertFeedback({
      partnerSlug,
      leadId: body.leadId,
      leadBusinessName: body.leadBusinessName ?? null,
      reportedStatus: body.reportedStatus,
      comment: body.comment ?? null,
      token,
    });

    return NextResponse.json({ ok: true, id: saved.id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to submit feedback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

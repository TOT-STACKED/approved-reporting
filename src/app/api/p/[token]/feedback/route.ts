import { NextResponse, type NextRequest } from 'next/server';
import { FEEDBACK_STATUS_OPTIONS, insertFeedback, postFeedbackToSlack } from '@/lib/feedback';

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

    // AWAIT the Slack ping. In serverless functions the runtime is killed the
    // moment we send the response, so any in-flight fetch (incl. fire-and-
    // forget) gets cancelled and the webhook never lands. The row is already
    // saved in Supabase regardless, and postFeedbackToSlack swallows its own
    // errors, so awaiting only costs ~150ms latency.
    const origin = new URL(request.url).origin;
    await postFeedbackToSlack({
      partnerSlug,
      leadBusinessName: body.leadBusinessName ?? null,
      reportedStatus: body.reportedStatus,
      comment: body.comment ?? null,
      portalBaseUrl: origin,
    });

    return NextResponse.json({ ok: true, id: saved.id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to submit feedback';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

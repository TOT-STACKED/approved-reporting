import { NextResponse, type NextRequest } from 'next/server';
import { FEEDBACK_STATUS_OPTIONS, insertFeedback, listFeedbackForPartner, postFeedbackToSlack } from '@/lib/feedback';

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

// Internal team version of the /api/p/[token]/feedback POST — same shape,
// same Supabase table, same Slack ping. Partner slug comes from the URL
// (no token check) because this endpoint is already behind the dashboard
// auth proxy. Source token tail is tagged 'internal' so we can distinguish
// team-submitted feedback from partner-submitted feedback downstream.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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
      partnerSlug: slug,
      leadId: body.leadId,
      leadBusinessName: body.leadBusinessName ?? null,
      reportedStatus: body.reportedStatus,
      comment: body.comment ?? null,
      token: 'internal',
    });

    // Same await pattern as the token endpoint: serverless kills the
    // function once the response returns, so fire-and-forget swallows the
    // Slack ping. Row is in Supabase either way; awaiting only costs ~150ms.
    const origin = new URL(request.url).origin;
    await postFeedbackToSlack({
      partnerSlug: slug,
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

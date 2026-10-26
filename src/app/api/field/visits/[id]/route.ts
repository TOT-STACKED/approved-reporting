import { after, NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { ReviewInputError, buildReviewSubmission, keepReviewAnswers, requestIntelligenceReport, reviewFrom, saveReview } from '@/lib/field-review';
import { addsNews, postVisitToSlack, type SlackVisit } from '@/lib/field-slack';
import { VisitInputError, canAccess, cleanVisitInput, deleteVisit, getVisit, updateVisit } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Edit a visit. Agents can edit their own; managers can edit any. Photos are
// checked against the visit owner's folder, so a manager's edit keeps them.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;
  const { id } = await params;

  const visit = await getVisit(id);
  if (!visit || !canAccess(agent, visit)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Keep the original visit time unless the edit sets one.
    const fields = cleanVisitInput({ visited_at: visit.visited_at, ...body }, visit.agent_id);
    // A review can be added on a later edit, but only once per visit. One that
    // can't be sent yet still saves the edit, with its tech kept (as for new visits).
    const rawReview = visit.submission_id ? null : reviewFrom(body);
    let review: Record<string, unknown> | null = null;
    let reviewError: string | null = null;
    if (rawReview) {
      keepReviewAnswers(fields, rawReview);
      try { review = buildReviewSubmission(rawReview, String(fields.venue_name)); }
      catch (e) { if (e instanceof ReviewInputError) reviewError = e.message; else throw e; }
    }

    await updateVisit(id, fields);
    // Tech or a contact added after the first save: tell the channel too.
    if (addsNews(visit as unknown as SlackVisit, fields as unknown as SlackVisit)) {
      after(() => postVisitToSlack(
        { ...(fields as unknown as SlackVisit), id },
        visit.agent_name || agent.name || agent.email,
        Boolean(review || visit.submission_id),
        true,
      ));
    }
    if (review) {
      const submissionId = await saveReview(review);
      await updateVisit(id, { submission_id: submissionId });
      after(() => requestIntelligenceReport(submissionId).catch(err => console.warn('[field] report request failed', err)));
    }
    return NextResponse.json({ ok: true, review: Boolean(review), reviewError });
  } catch (error: unknown) {
    if (error instanceof VisitInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.warn('[field] update visit failed', error);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;
  const { id } = await params;

  const visit = await getVisit(id);
  if (!visit || !canAccess(agent, visit)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteVisit(id);
  return NextResponse.json({ ok: true });
}

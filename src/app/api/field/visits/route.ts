import { after, NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { VisitInputError, cleanVisitInput, createVisit, listVisits, updateVisit } from '@/lib/field-db';
import { markStopVisited } from '@/lib/field-routes';
import { ReviewInputError, buildReviewSubmission, requestIntelligenceReport, reviewFrom, saveReview } from '@/lib/field-review';

export const dynamic = 'force-dynamic';

// Agents get their own visits; managers get everyone's, optionally filtered.
export async function GET(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  const p = request.nextUrl.searchParams;
  const visits = await listVisits({
    agentId: agent.role === 'manager' ? p.get('agent') || undefined : agent.id,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
    limit: Number(p.get('limit')) || undefined,
  });
  return NextResponse.json({ visits });
}

export async function POST(request: NextRequest) {
  const agent = await requireAgent();
  if (agent instanceof NextResponse) return agent;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fields = cleanVisitInput(body, agent.id);
    // Check the review before saving anything, so a half-filled one doesn't leave a visit behind.
    const rawReview = reviewFrom(body);
    const review = rawReview ? buildReviewSubmission(rawReview, String(fields.venue_name)) : null;

    const id = await createVisit(agent.id, fields);
    if (review) {
      const submissionId = await saveReview(review);
      await updateVisit(id, { submission_id: submissionId });
      after(() => requestIntelligenceReport(submissionId).catch(err => console.warn('[field] report request failed', err)));
    }
    // Tick the route stop. Named from "Start visit here": done now, so the
    // route shows it ticked when the phone goes back to it. Otherwise matched
    // by place in the background.
    const tick = () => markStopVisited(
      agent.id,
      { id, visited_at: String(fields.visited_at), lat: Number(fields.lat), lng: Number(fields.lng), osm_ref: (fields.osm_ref as string | null) ?? null },
      { route_id: body.route_id, stop_id: body.stop_id },
    ).catch(err => console.warn('[field] route tick failed', err));
    if (body.route_id) await tick();
    else after(tick);
    return NextResponse.json({ id, review: Boolean(review) });
  } catch (error: unknown) {
    if (error instanceof VisitInputError || error instanceof ReviewInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.warn('[field] create visit failed', error);
    return NextResponse.json({ error: "Couldn't save the visit. Try again." }, { status: 500 });
  }
}

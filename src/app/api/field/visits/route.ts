import { after, NextResponse, type NextRequest } from 'next/server';
import { requireAgent } from '@/lib/field-api';
import { VisitInputError, cleanVisitInput, createVisit, findResend, listVisits, updateVisit } from '@/lib/field-db';
import { placeFromClues } from '@/lib/field-import';
import { postVisitToSlack, type SlackVisit } from '@/lib/field-slack';
import { markStopVisited } from '@/lib/field-routes';
import { ReviewInputError, buildReviewSubmission, keepReviewAnswers, requestIntelligenceReport, reviewFrom, saveReview } from '@/lib/field-review';

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
    // A review that can't be sent yet (missing email, no consent…) doesn't
    // stop the visit saving: its tech and contact are kept on the visit, and
    // the agent is told what's missing so they can finish it from the visit.
    const rawReview = reviewFrom(body);
    let review: Record<string, unknown> | null = null;
    let reviewError: string | null = null;
    if (rawReview) {
      keepReviewAnswers(fields, rawReview);
      try { review = buildReviewSubmission(rawReview, String(fields.venue_name)); }
      catch (e) { if (e instanceof ReviewInputError) reviewError = e.message; else throw e; }
    }

    // A resend from the phone's offline queue: hand back the one already saved.
    const already = await findResend(agent.id, String(fields.visited_at), String(fields.venue_name)).catch(() => null);
    if (already) return NextResponse.json({ id: already, review: false, resent: true });

    // Saved with "pin it later": try the postcode / address now it's online.
    if (fields.geo_precision === 'none') {
      const place = await placeFromClues(String(fields.venue_name), String(fields.address || ''), String(fields.postcode || '')).catch(() => null);
      if (place) Object.assign(fields, { lat: place.lat, lng: place.lng, geo_precision: place.precision, postcode: fields.postcode || place.postcode });
    }

    const id = await createVisit(agent.id, fields);
    if (review) {
      const submissionId = await saveReview(review);
      await updateVisit(id, { submission_id: submissionId });
      after(() => requestIntelligenceReport(submissionId).catch(err => console.warn('[field] report request failed', err)));
    }
    // Tick the route stop. Named from "Start visit here": done now, so the
    // route shows it ticked when the phone goes back to it. Otherwise matched
    // by place in the background.
    const tick = () => fields.lat == null && !body.route_id ? Promise.resolve() : markStopVisited(
      agent.id,
      { id, visited_at: String(fields.visited_at), lat: Number(fields.lat), lng: Number(fields.lng), osm_ref: (fields.osm_ref as string | null) ?? null },
      { route_id: body.route_id, stop_id: body.stop_id },
    ).catch(err => console.warn('[field] route tick failed', err));
    if (body.route_id) await tick();
    else after(tick);
    // The team's Slack channel hears about every visit (not resends, returned above).
    after(() => postVisitToSlack(
      { ...(fields as unknown as SlackVisit), id },
      agent.name || agent.email,
      Boolean(review),
    ));
    return NextResponse.json({ id, review: Boolean(review), reviewError });
  } catch (error: unknown) {
    if (error instanceof VisitInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.warn('[field] create visit failed', error);
    return NextResponse.json({ error: "Couldn't save the visit. Try again." }, { status: 500 });
  }
}

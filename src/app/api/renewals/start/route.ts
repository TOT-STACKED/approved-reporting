import { after, NextResponse, type NextRequest } from 'next/server';
import { sessionEmail } from '@/lib/renewals-auth';
import { failed } from '@/lib/renewals-api';
import {
  findMember,
  insertSubmission,
  provisionFromSubmission,
  requestIntelligenceReport,
} from '@/lib/renewals-db';
import {
  REVIEW_CATEGORIES,
  bandForSiteCount,
  isVenueType,
  otherKey,
  productNps,
  scoreReview,
  type Stack,
} from '@/lib/intelligence-review';

export const dynamic = 'force-dynamic';

// Sign-up for someone with no Intelligence Review: save their review, then
// create their Renewals account from it. The email is the one they just
// verified with a code, never one from the request body.

function text(v: unknown, max = 120): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Rebuild the stack from what the browser sent, keeping only known shapes and tool names typed or picked. */
function cleanStack(input: unknown): Stack {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Stack = {};
  for (const c of REVIEW_CATEGORIES) {
    const e = (raw[c.id] && typeof raw[c.id] === 'object' ? raw[c.id] : {}) as Record<string, unknown>;
    const none = e.none === true;
    const tools = none ? [] : (Array.isArray(e.tools) ? e.tools : [])
      .filter((t): t is string => typeof t === 'string' && c.options.includes(t));
    const other = none ? '' : text(e.other, 80);
    const allowed = new Set([...tools, ...(other ? [otherKey(other)] : [])]);
    const nps: Record<string, number> = {};
    const rawNps = (e.nps && typeof e.nps === 'object' ? e.nps : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawNps)) {
      if (allowed.has(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10) nps[k] = v;
    }
    out[c.id] = { tools: [...new Set(tools)], other, none, nps };
  }
  return out;
}

export async function POST(request: NextRequest) {
  const email = await sessionEmail();
  if (!email) return NextResponse.json({ error: 'Sign in again' }, { status: 401 });

  try {
    if (await findMember(email)) return NextResponse.json({ ok: true });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const firstName = text(body.firstName, 60);
    const lastName = text(body.lastName, 60);
    const venueName = text(body.venueName);
    const location = text(body.location, 80);
    const phone = text(body.phone, 30);
    const venueType = isVenueType(body.venueType) ? String(body.venueType) : '';
    const siteCount = Math.round(Number(body.siteCount));

    if (!firstName || !lastName || !venueName || !location || !venueType) {
      return NextResponse.json({ error: 'Fill in every field about you and your venue' }, { status: 400 });
    }
    if (!Number.isFinite(siteCount) || siteCount < 1 || siteCount > 5000) {
      return NextResponse.json({ error: 'How many sites do you run?' }, { status: 400 });
    }
    if (phone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Enter a phone number' }, { status: 400 });
    }

    const stack = cleanStack(body.stack);
    const nps = productNps(stack);
    const scores = Object.values(nps);
    const r = scoreReview(venueType, siteCount, stack);

    const submissionId = await insertSubmission({
      venue_type: venueType,
      sites: bandForSiteCount(siteCount),
      site_count: siteCount,
      stack,
      product_nps: nps,
      nps_avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      first_name: firstName,
      last_name: lastName,
      email,
      phone_number: phone,
      company: venueName,
      brand_trading_name: venueName,
      location,
      consent: body.consent === true,
      score: r.score,
      coverage_pct: r.coverage,
      total_gbp_per_year: r.totalGbp,
      total_hrs_per_week: r.totalHrs,
      gap_count: r.gapCount,
      gap_categories: r.gapCategories,
      segment: r.segment,
    });

    const member = await provisionFromSubmission(email);
    if (!member) throw new Error('provision after review returned no member');

    // The AI-written report takes a while; don't make them wait for it.
    after(() => requestIntelligenceReport(submissionId).catch(err => console.warn('[renewals] report request failed', err)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed('start', err, "We couldn't save that. Try again.");
  }
}

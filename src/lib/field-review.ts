// An Intelligence Review done in the field, with the operator, as part of a
// visit. It's saved as a normal `submissions` row (same shape and scoring as
// the techstackreview form and Renewals), so the Slack ping, the AI-written
// report emailed to the operator, the partner portal and the marketplace all
// treat it like any other review. The visit keeps a link to it.

import {
  CONSENT_TEXT,
  bandForSiteCount,
  cleanReviewStack,
  isVenueType,
  productNps,
  scoreReview,
} from './intelligence-review';
import { insertSubmission, requestIntelligenceReport } from './renewals-db';

export class ReviewInputError extends Error {}

const text = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validate what the phone sent and build the submission row. Throws ReviewInputError with a message the agent can act on. */
export function buildReviewSubmission(input: Record<string, unknown>, venueName: string): Record<string, unknown> {
  const firstName = text(input.firstName, 60);
  const lastName = text(input.lastName, 60);
  const email = text(input.email, 200).toLowerCase();
  const phone = text(input.phone, 30);
  const location = text(input.location, 80);
  const venueType = isVenueType(input.venueType) ? String(input.venueType) : '';
  const siteCount = Math.round(Number(input.siteCount));

  if (!firstName || !lastName) throw new ReviewInputError('Review: add their first and last name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ReviewInputError('Review: add their email, the report goes there');
  if (phone.replace(/\D/g, '').length < 7) throw new ReviewInputError('Review: add their phone number');
  if (!location) throw new ReviewInputError('Review: add the town');
  if (!venueType) throw new ReviewInputError('Review: pick what kind of business it is');
  if (!Number.isFinite(siteCount) || siteCount < 1 || siteCount > 5000) throw new ReviewInputError('Review: how many sites do they run?');
  if (input.consent !== true) throw new ReviewInputError(`Review: tick that they’re OK with “${CONSENT_TEXT.split('.')[0]}”`);

  const stack = cleanReviewStack(input.stack);
  const nps = productNps(stack);
  const scores = Object.values(nps);
  const r = scoreReview(venueType, siteCount, stack);

  return {
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
    consent: true,
    score: r.score,
    coverage_pct: r.coverage,
    total_gbp_per_year: r.totalGbp,
    total_hrs_per_week: r.totalHrs,
    gap_count: r.gapCount,
    gap_categories: r.gapCategories,
    segment: r.segment,
  };
}

/**
 * Copy what the agent typed into a review onto the visit itself: its tech
 * answers become the visit's seen tech, and the operator's details fill any
 * empty contact fields. Done whether or not the review can be sent, so a
 * half-finished review (no consent yet, no email) never loses what was seen.
 * Seen tech the agent logged separately wins over the review's answer.
 */
export function keepReviewAnswers(fields: Record<string, unknown>, review: Record<string, unknown>) {
  const stack = { ...((fields.stack as Record<string, unknown>) || {}) };
  for (const [key, e] of Object.entries(cleanReviewStack(review.stack))) {
    if (stack[key] || !(e.tools.length || e.other || e.none)) continue;
    stack[key] = { tools: e.tools, other: e.other, none: e.none };
  }
  fields.stack = stack;
  const name = [text(review.firstName, 60), text(review.lastName, 60)].filter(Boolean).join(' ');
  if (!fields.contact_name && name) fields.contact_name = name;
  if (!fields.contact_email && text(review.email, 200)) fields.contact_email = text(review.email, 200).toLowerCase();
  if (!fields.contact_phone && text(review.phone, 30)) fields.contact_phone = text(review.phone, 30);
}

/** Is there a review in this request body that the agent switched on? */
export function reviewFrom(body: Record<string, unknown>): Record<string, unknown> | null {
  const r = body.review;
  return r && typeof r === 'object' && (r as Record<string, unknown>).enabled === true ? (r as Record<string, unknown>) : null;
}

/** Save the review, and ask for the AI report (emailed to the operator) without waiting on it. */
export async function saveReview(row: Record<string, unknown>): Promise<string> {
  return insertSubmission(row);
}

export { requestIntelligenceReport };

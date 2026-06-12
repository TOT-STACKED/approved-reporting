// Partner-submitted feedback on leads. Stored in Supabase. Used by:
//   - POST /api/p/<token>/feedback   (partner-facing, token-validated)
//   - GET  /api/partners/<slug>/feedback (internal, auth-gated by proxy)

const SUPABASE_URL = process.env.STACKCOLLECT_SUPABASE_URL!;
const SUPABASE_KEY = process.env.STACKCOLLECT_SUPABASE_KEY!;

const TABLE = 'lead_feedback';

export const FEEDBACK_STATUS_OPTIONS = [
  'MQL',
  'SQL',
  'Demo booked',
  'Closed Won',
  'Closed Lost',
  'On hold / nurture',
  'Other',
] as const;
export type FeedbackStatus = typeof FEEDBACK_STATUS_OPTIONS[number];

export interface LeadFeedback {
  id: string;
  created_at: string;
  partner_slug: string;
  lead_id: string;
  lead_business_name: string | null;
  reported_status: string;
  comment: string | null;
  source_token_tail: string | null;
}

function sbHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function insertFeedback(input: {
  partnerSlug: string;
  leadId: string;
  leadBusinessName: string | null;
  reportedStatus: string;
  comment: string | null;
  token: string;
}): Promise<LeadFeedback> {
  const row = {
    partner_slug: input.partnerSlug,
    lead_id: input.leadId,
    lead_business_name: input.leadBusinessName?.slice(0, 500) || null,
    reported_status: input.reportedStatus.slice(0, 100),
    comment: input.comment?.trim().slice(0, 2000) || null,
    source_token_tail: input.token ? input.token.slice(-8) : null,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Save failed (${res.status}). ${detail}`.trim());
  }
  const [created] = (await res.json()) as LeadFeedback[];
  return created;
}

/** Fire-and-forget Slack notification on a new feedback submission. Posts to
 * the incoming webhook in FEEDBACK_SLACK_WEBHOOK_URL. Errors here never block
 * the feedback submission itself — the row is already in Supabase. */
export async function postFeedbackToSlack(args: {
  partnerSlug: string;
  partnerDisplayName?: string;
  leadBusinessName: string | null;
  reportedStatus: string;
  comment: string | null;
  portalBaseUrl: string;
}): Promise<void> {
  const url = process.env.FEEDBACK_SLACK_WEBHOOK_URL;
  if (!url) return; // not configured — silently skip

  const partnerLabel = args.partnerDisplayName ||
    args.partnerSlug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const linkToPartner = `${args.portalBaseUrl}/partners/${args.partnerSlug}`;
  const business = args.leadBusinessName || '(no business name)';

  const headline = `🎯 *${partnerLabel}* updated a lead status`;
  const detailLines = [
    `*Lead:* ${business}`,
    `*Now:* ${args.reportedStatus}`,
    args.comment ? `*Note:* ${args.comment}` : null,
  ].filter(Boolean).join('\n');

  const payload = {
    text: `${headline}\n${business} → ${args.reportedStatus}`, // fallback for notifications
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
      { type: 'section', text: { type: 'mrkdwn', text: detailLines } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<${linkToPartner}|Open ${partnerLabel} in the portal →>` }],
      },
    ],
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // swallowed — Slack outages shouldn't surface to the partner
  }
}

export async function listFeedbackForPartner(partnerSlug: string): Promise<LeadFeedback[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?partner_slug=eq.${encodeURIComponent(partnerSlug)}&select=*&order=created_at.desc&limit=100`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  return (await res.json()) as LeadFeedback[];
}

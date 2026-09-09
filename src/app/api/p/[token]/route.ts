import { NextResponse } from 'next/server';
import { getPartnerDetail, emptyPartnerDetail, toClientPartner } from '@/lib/airtable';
import { getPartnerStackCollectData } from '@/lib/stackcollect';
import { canSeeLeadDetail } from '@/lib/partner-tier';
import { tierForSlug } from '@/lib/partner-package';
import { getCommunityPipeline } from '@/lib/leads';

export const dynamic = 'force-dynamic';

function getTokenMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.PARTNER_TOKENS || '{}');
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenMap = getTokenMap();
    const slug = tokenMap[token];

    if (!slug) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    // The token is valid, so the partner is real — a null detail just means
    // no leads are tagged to them yet. Serve an empty dashboard so a
    // freshly onboarded partner's link works from day one. `empty` lets the
    // client keep its cold-start retry: a partial Airtable read looks the
    // same as a genuinely lead-free partner from here.
    const detail = await getPartnerDetail(slug);
    const partner = detail || emptyPartnerDetail(slug);

    // NPS no longer comes down here. It's computed from the same rows as the
    // score dashboard and served by ./score, so the partner page reads
    // nps_scores once per load instead of twice.
    const stackCollect = await getPartnerStackCollectData(partner.name);

    // Tier gate. Promote pays for Intelligence and their own pipeline
    // numbers, not for who the leads are — so the rows never leave the
    // server. statusBreakdown and leadCount are aggregates and stay: the
    // count is the whole point of the upsell.
    const tier = await tierForSlug(slug);
    const client = toClientPartner(partner);
    const payload = canSeeLeadDetail(tier) ? client : { ...client, leads: [], recentLeadCount: 0 };

    // Promote sees what Stacked is working across the whole community,
    // not a partner-shaped pipeline of their own. Only fetched for Promote —
    // it's a full lead read, and Approved has no use for it.
    const community = canSeeLeadDetail(tier) ? null : await getCommunityPipeline();

    return NextResponse.json({
      partner: payload,
      tier,
      community,
      stackCollect,
      empty: !detail,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

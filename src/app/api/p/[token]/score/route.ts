import { NextResponse } from 'next/server';
import { getPartnerDetail, emptyPartnerDetail } from '@/lib/airtable';
import { getPartnerScoreIntelligence } from '@/lib/stackcollect';

export const dynamic = 'force-dynamic';

// Score intelligence sits on its own endpoint rather than inside
// /api/p/[token] because it reads every clean NPS row plus every business
// submission to compute category benchmarks. Keeping it separate means the
// leads dashboard still paints at its usual speed and this section fills in
// behind it.

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
    const slug = getTokenMap()[token];

    if (!slug) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    // A valid token means a real partner; a missing Airtable record just means
    // no leads are tagged yet, which has no bearing on their score.
    const detail = await getPartnerDetail(slug);
    const partner = detail || emptyPartnerDetail(slug);
    const score = await getPartnerScoreIntelligence(partner.name);

    return NextResponse.json({ partner: { name: partner.name }, score });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

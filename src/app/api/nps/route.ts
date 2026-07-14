import { NextResponse } from 'next/server';
import { getNpsScores, rollupNpsByVendor } from '@/lib/stackcollect';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const scores = await getNpsScores();

    // Filter out our own pipeline smoke-test rows and any clearly-bogus vendor names.
    // 'low-nps-slack-test' is a QA touchpoint used to test the low-NPS Slack
    // alert wiring — always TestVendorCo/Test Hospitality Ltd, not real data.
    // Any vendor prefixed with '__' is treated as a diagnostic/test marker
    // (__e2e_check__, __diag_vendor__, etc.) — keeps the top-vendors ranking
    // clean without having to enumerate each test name individually.
    const TEST_TOUCHPOINTS = new Set(['pipeline-smoke-test', 'low-nps-slack-test']);
    const clean = scores.filter(
      s => !(s.vendor ?? '').trim().startsWith('__') && !TEST_TOUCHPOINTS.has(s.touchpoint ?? '')
    );

    const vendorRollup = rollupNpsByVendor(clean);

    const bySource: Record<string, number> = {};
    for (const s of clean) bySource[s.source] = (bySource[s.source] || 0) + 1;

    const all = clean.map(s => s.score);
    const promoters = all.filter(s => s >= 9).length;
    const passives = all.filter(s => s === 7 || s === 8).length;
    const detractors = all.filter(s => s <= 6).length;
    const overallNps = all.length
      ? Math.round(((promoters - detractors) / all.length) * 100)
      : null;
    const avg = all.length
      ? Number((all.reduce((a, b) => a + b, 0) / all.length).toFixed(1))
      : null;

    // Send every row so the client can filter by period accurately. The UI
    // caps the visible table at 20 rows separately — this just lets the
    // period buttons and KPI cards reflect the right slice instead of always
    // operating on the newest 20 records.
    const recent = clean.map(s => ({
      id: s.id,
      created_at: s.created_at,
      source: s.source,
      touchpoint: s.touchpoint,
      score: s.score,
      vendor: s.vendor,
      category: s.category,
      company: s.company,
      comment: s.comment,
    }));

    return NextResponse.json({
      total: clean.length,
      overallNps,
      avg,
      promoters,
      passives,
      detractors,
      bySource,
      vendorRollup,
      recent,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

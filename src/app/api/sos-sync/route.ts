import { NextResponse } from 'next/server';
import { getNpsScores, matchTermsForPartner, rollupNpsByVendor } from '@/lib/stackcollect';

// Syncs the Stacked Operator Score (SOS) onto the marketplace Partners table
// in Airtable, so the Framer marketplace tiles can display a star rating.
//
// SOS is the SAME calculation the SOS League Table uses:
//   sos = round((avg operator rating 0-10 / 2), 1)   → 0..5, one decimal
// A partner is scored only at MIN_RESPONSES+ reviews (matches the league table).
//
// Vendor -> partner matching uses the SAME grouping the League Table uses:
// rollupNpsByVendor() groups NPS rows by exact vendor name (case-insensitive,
// whitespace-trimmed). We then take, for each partner, the rollup rows whose
// vendor matches any of the partner's aliases in PARTNER_VENDOR_ALIASES —
// aggregating counts and averages across the aliases so multi-alias vendors
// (e.g. "Seven Rooms" ← ["sevenrooms","seven rooms","7rooms"]) still combine,
// while incidental substring hits (e.g. an unrelated "Como Bar" row) do NOT
// contaminate a partner's average. This guarantees the marketplace tile shows
// the exact same SOS/count the League Table shows for that vendor.
//
// NOTE: the marketplace Partners table lives in a DIFFERENT Airtable base from
// the portal's CRM base, so this uses its own env vars / key.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_RESPONSES = 2;

const MP_BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID!;              // e.g. appNvxXXaMWJfiX6X
const MP_TABLE = process.env.MARKETPLACE_PARTNERS_TABLE || 'Partners';  // name or tbl... id
const MP_KEY = process.env.MARKETPLACE_AIRTABLE_KEY!;                   // PAT: read+write on MP_BASE
// The marketplace `SOS Score` / `SOS Reviews` fields on Partners are FORMULAS
// (prefer live rollup from Reviews table, fall back to the `(manual)` fields).
// We write to the `(manual)` fields so the formula's fallback picks us up.
// Historically these held hand-entered values; they now hold computed SOS.
const SCORE_FIELD = process.env.MARKETPLACE_SOS_SCORE_FIELD || 'SOS Score (manual)';
const REVIEWS_FIELD = process.env.MARKETPLACE_SOS_REVIEWS_FIELD || 'SOS Reviews (manual)';

function sosFromAvg(avg: number): number {
  return Math.round((avg / 2) * 10) / 10;
}

async function mpFetchAllPartners(): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(MP_TABLE)}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', 'Name');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${MP_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Airtable partners fetch ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const r of data.records) out.push({ id: r.id, name: (r.fields?.Name ?? '').toString().trim() });
    offset = data.offset;
  } while (offset);
  return out;
}

async function mpPatch(records: Array<{ id: string; fields: Record<string, unknown> }>) {
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const res = await fetch(`https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(MP_TABLE)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: chunk }),
    });
    if (!res.ok) throw new Error(`Airtable PATCH ${res.status}: ${await res.text()}`);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.SOS_SYNC_SECRET || url.searchParams.get('secret') !== process.env.SOS_SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = url.searchParams.get('dry') === '1';

  try {
    const [scores, partners] = await Promise.all([getNpsScores(), mpFetchAllPartners()]);

    // Roll NPS rows up per exact vendor name — same grouping the League Table
    // uses. Everything below is then a lookup into this rollup rather than a
    // fresh regex sweep, which is what guarantees the marketplace matches the
    // League Table one for one.
    const rollup = rollupNpsByVendor(scores);
    const rollupByVendor = new Map<string, { avg: number; count: number }>();
    for (const r of rollup) {
      rollupByVendor.set(r.vendor.toLowerCase().trim(), { avg: r.avg, count: r.count });
    }

    const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    const ranked: Array<{ name: string; sos: number; count: number }> = [];
    // Track which rollup vendors got claimed by at least one partner, so the
    // unmatchedVendors diagnostic below stays accurate under the new logic.
    const claimedVendors = new Set<string>();

    for (const p of partners) {
      if (!p.name) continue;
      const aliases = matchTermsForPartner(p.name).map((a) => a.toLowerCase().trim());

      // Aggregate across every alias that has a rollup row. For a single-alias
      // partner (the common case) this is a straight lookup; for multi-alias
      // vendors (e.g. Seven Rooms) it's a weighted average across the aliases.
      let totalScore = 0;
      let totalCount = 0;
      for (const alias of aliases) {
        const row = rollupByVendor.get(alias);
        if (row) {
          totalScore += row.avg * row.count;
          totalCount += row.count;
          claimedVendors.add(alias);
        }
      }

      if (totalCount >= MIN_RESPONSES) {
        const avg = totalScore / totalCount;
        const sos = sosFromAvg(avg);
        updates.push({ id: p.id, fields: { [SCORE_FIELD]: sos, [REVIEWS_FIELD]: totalCount } });
        ranked.push({ name: p.name, sos, count: totalCount });
      } else {
        // Clear any stale score; keep a truthful (sub-threshold) review count.
        updates.push({ id: p.id, fields: { [SCORE_FIELD]: null, [REVIEWS_FIELD]: totalCount || null } });
      }
    }

    // Vendors with 2+ reviews that no partner alias claimed — candidates for a
    // new alias in PARTNER_VENDOR_ALIASES (or a partner that isn't on the
    // marketplace at all).
    const unmatchedVendors = rollup
      .filter((r) => r.count >= MIN_RESPONSES && !claimedVendors.has(r.vendor.toLowerCase().trim()))
      .sort((a, b) => b.count - a.count)
      .map(({ vendor, count }) => ({ vendor, count }));

    if (!dry) await mpPatch(updates);

    return NextResponse.json({
      ok: true,
      dry,
      partners: partners.length,
      npsRows: scores.length,
      rankedWritten: ranked.length,
      ranked: ranked.sort((a, b) => b.sos - a.sos || b.count - a.count),
      unmatchedVendors,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

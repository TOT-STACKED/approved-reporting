import { NextResponse } from 'next/server';
import { getNpsScores, matchTermsForPartner } from '@/lib/stackcollect';

// Syncs the Stacked Operator Score (SOS) onto the marketplace Partners table
// in Airtable, so the Framer marketplace tiles can display a star rating.
//
// SOS is the SAME calculation the SOS League Table uses:
//   sos = round((avg operator rating 0-10 / 2), 1)   → 0..5, one decimal
// A partner is scored only at MIN_RESPONSES+ reviews (matches the league table).
//
// Vendor -> partner matching reuses PARTNER_VENDOR_ALIASES via
// matchTermsForPartner(), word-boundary matched, so "SumUp POS" -> "SumUp" etc.
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

function termPatterns(terms: string[]): RegExp[] {
  return terms.map((t) => {
    const escaped = t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
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

    const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    const ranked: Array<{ name: string; sos: number; count: number }> = [];

    for (const p of partners) {
      if (!p.name) continue;
      const pats = termPatterns(matchTermsForPartner(p.name));
      const matched = scores.filter((s) => {
        const v = (s.vendor ?? '').trim();
        return v && pats.some((re) => re.test(v));
      });
      const count = matched.length;
      if (count >= MIN_RESPONSES) {
        const avg = matched.reduce((a, b) => a + b.score, 0) / count;
        const sos = sosFromAvg(avg);
        updates.push({ id: p.id, fields: { [SCORE_FIELD]: sos, [REVIEWS_FIELD]: count } });
        ranked.push({ name: p.name, sos, count });
      } else {
        // Clear any stale score; keep a truthful (sub-threshold) review count.
        updates.push({ id: p.id, fields: { [SCORE_FIELD]: null, [REVIEWS_FIELD]: count || null } });
      }
    }

    // Vendors with 2+ reviews that matched NO partner — candidates for a new
    // alias in PARTNER_VENDOR_ALIASES (or a partner that isn't on the marketplace).
    const byVendor = new Map<string, number>();
    for (const s of scores) {
      const v = (s.vendor ?? '').trim().toLowerCase();
      if (v) byVendor.set(v, (byVendor.get(v) ?? 0) + 1);
    }
    const partnerPats = partners.map((p) => termPatterns(matchTermsForPartner(p.name)));
    const unmatchedVendors = Array.from(byVendor.entries())
      .filter(([v, c]) => c >= MIN_RESPONSES && !partnerPats.some((pats) => pats.some((re) => re.test(v))))
      .sort((a, b) => b[1] - a[1])
      .map(([vendor, count]) => ({ vendor, count }));

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

import { NextResponse } from 'next/server';
import {
  getBusinessSubmissions,
  getTechStackEntries,
  matchTermsForPartner,
  type BusinessSubmission,
  type TechStackEntry,
} from '@/lib/stackcollect';

// Syncs venue x tool "who uses what" rows into the marketplace Tech Usage
// table in Airtable, so Framer partner pages can show operator names + counts.
//
// Wipe-and-replace per venue: for every venue with a submission in the delta
// window, all their existing Source="Self-reported (Health Check)" rows are
// deleted and re-inserted from that venue's LATEST submission. Rows from other
// sources (e.g. Stacked-verified) are never touched.
//
// Partner matching reuses matchTermsForPartner() from the SOS sync — same
// word-boundary regex against tool names.
//
// Params:
//   secret     — must equal SOS_SYNC_SECRET (reused; same author, same trust boundary)
//   dry=1      — plan only, no writes
//   full=1     — process every venue (backfill mode). Default only processes
//                venues whose latest submission is in the last SINCE_DEFAULT_DAYS.
//   since=ISO  — override the delta cutoff
//   venue=X    — only process venues whose name contains X (case-insensitive)
//
// NOTE: Airtable rate limit is 5 req/s per base. Full backfill can exceed the
// 60s Next.js maxDuration; run with `?full=1` off-hours and re-invoke if it
// times out — the sync is idempotent (wipe-and-replace).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SINCE_DEFAULT_DAYS = 7;
const SOURCE_LABEL = 'Self-reported (Health Check)';

const MP_BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID!;
const MP_KEY = process.env.MARKETPLACE_AIRTABLE_KEY!;
const PARTNERS_TABLE = process.env.MARKETPLACE_PARTNERS_TABLE || 'Partners';
const VENUES_TABLE = process.env.MARKETPLACE_VENUES_TABLE || 'Venues';
const TECH_USAGE_TABLE = process.env.MARKETPLACE_TECH_USAGE_TABLE || 'Tech Usage';

// The Airtable Category singleSelect option names. Anything the sync produces
// that doesn't match one of these (after alias lookup) lands in "Other".
const AIRTABLE_CATEGORIES = new Set([
  'AI',
  'Allergen',
  'Analytics & Reporting',
  'Connectivity & IT',
  'Delivery Management',
  'Finance & Accounting',
  'Food Safety & Compliance',
  'Guest Communications',
  'Guest Feedback',
  'Inventory & Stock Management',
  'Kiosks & Self-Service',
  'Kitchen Display System',
  'Learning & Development',
  'Loyalty & CRM',
  'Maintenance',
  'Marketing & Website',
  'Mobile/QR Ordering',
  'Other',
  'Payments',
  'Payroll',
  'People Management',
  'Point of Sale',
  'Property Management',
  'Reservations',
  'Sustainability',
  'Uncategorised',
]);

// Legacy / shorthand category keys we've seen in tech_stack_entries → canonical
// Airtable options. Everything is lowercased before lookup.
const CATEGORY_ALIASES: Record<string, string> = {
  pos: 'Point of Sale',
  epos: 'Point of Sale',
  workforce: 'People Management',
  people: 'People Management',
  inventory: 'Inventory & Stock Management',
  loyalty: 'Loyalty & CRM',
  crm: 'Loyalty & CRM',
  'crm/loyalty': 'Loyalty & CRM',
  'crm & loyalty': 'Loyalty & CRM',
  learning: 'Learning & Development',
  finance: 'Finance & Accounting',
  ops: 'Finance & Accounting',
  'finance/ops': 'Finance & Accounting',
  'finance & ops': 'Finance & Accounting',
  reservations: 'Reservations',
  bookings: 'Reservations',
  reporting: 'Analytics & Reporting',
  analytics: 'Analytics & Reporting',
  kitchen: 'Kitchen Display System',
  kds: 'Kitchen Display System',
  marketing: 'Marketing & Website',
  website: 'Marketing & Website',
  payroll: 'Payroll',
};

function normalizeCategory(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return 'Other';
  if (AIRTABLE_CATEGORIES.has(t)) return t;
  const lower = t.toLowerCase();
  for (const canon of AIRTABLE_CATEGORIES) {
    if (canon.toLowerCase() === lower) return canon;
  }
  return CATEGORY_ALIASES[lower] || 'Other';
}

function termPatterns(terms: string[]): RegExp[] {
  return terms.map((t) => {
    const escaped = t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

// --- Airtable helpers ---

type AirtableRecord = { id: string; fields: Record<string, unknown> };

async function airtableFetchAll(
  table: string,
  fields: string[],
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(table)}`,
    );
    url.searchParams.set('pageSize', '100');
    for (const f of fields) url.searchParams.append('fields[]', f);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${MP_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(
        `Airtable ${table} fetch ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }
    const data = await res.json();
    for (const r of data.records) out.push({ id: r.id, fields: r.fields ?? {} });
    offset = data.offset;
  } while (offset);
  return out;
}

async function airtableCreate(
  table: string,
  records: Array<{ fields: Record<string, unknown> }>,
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const res = await fetch(
      `https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(table)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MP_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: chunk, typecast: true }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Airtable create ${table} ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }
    const data = await res.json();
    for (const r of data.records) out.push({ id: r.id, fields: r.fields ?? {} });
  }
  return out;
}

async function airtableUpdate(
  table: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>,
): Promise<void> {
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const res = await fetch(
      `https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(table)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${MP_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: chunk }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Airtable update ${table} ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }
  }
}

async function airtableDelete(table: string, recordIds: string[]): Promise<void> {
  for (let i = 0; i < recordIds.length; i += 10) {
    const chunk = recordIds.slice(i, i + 10);
    const url = new URL(
      `https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(table)}`,
    );
    for (const id of chunk) url.searchParams.append('records[]', id);
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${MP_KEY}` },
    });
    if (!res.ok) {
      throw new Error(
        `Airtable delete ${table} ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }
  }
}

// --- Row builder ---

function buildTechUsageRows(
  venueId: string,
  venueName: string,
  submission: BusinessSubmission,
  entries: TechStackEntry[],
  partnerIndex: Array<{ id: string; patterns: RegExp[] }>,
): Array<{ fields: Record<string, unknown> }> {
  const seen = new Set<string>();
  const rows: Array<{ fields: Record<string, unknown> }> = [];
  const submissionDate = submission.created_at.slice(0, 10);
  for (const e of entries) {
    const tool = (e.tool_name ?? '').trim();
    if (!tool) continue;
    const category = normalizeCategory(e.category);
    const dedupeKey = `${category}|${tool.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const matched = partnerIndex.find((p) => p.patterns.some((re) => re.test(tool)));

    const fields: Record<string, unknown> = {
      Entry: `${venueName} — ${tool}`,
      Tool: tool,
      Category: category,
      Source: SOURCE_LABEL,
      'Submission date': submissionDate,
      Venue: [venueId],
    };
    if (matched) fields.Partner = [matched.id];
    rows.push({ fields });
  }
  return rows;
}

// --- Handler ---

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !process.env.SOS_SYNC_SECRET ||
    url.searchParams.get('secret') !== process.env.SOS_SYNC_SECRET
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = url.searchParams.get('dry') === '1';
  const full = url.searchParams.get('full') === '1';
  const onlyVenueQuery = url.searchParams.get('venue')?.toLowerCase().trim() || null;
  const sinceParam = url.searchParams.get('since');
  const sinceMs = full
    ? 0
    : sinceParam
      ? new Date(sinceParam).getTime()
      : Date.now() - SINCE_DEFAULT_DAYS * 24 * 60 * 60 * 1000;

  try {
    // 1. Fetch Supabase (source of truth)
    const [submissions, entries] = await Promise.all([
      getBusinessSubmissions(),
      getTechStackEntries(),
    ]);

    // 2. Group entries by submission_id
    const entriesBySubmission = new Map<string, TechStackEntry[]>();
    for (const e of entries) {
      const arr = entriesBySubmission.get(e.submission_id) || [];
      arr.push(e);
      entriesBySubmission.set(e.submission_id, arr);
    }

    // 3. Pick latest submission per venue (case-insensitive name grouping)
    const latestByVenue = new Map<string, BusinessSubmission>();
    for (const s of submissions) {
      const name = s.business_name?.trim();
      if (!name) continue;
      const key = normalizeName(name);
      const existing = latestByVenue.get(key);
      if (!existing || s.created_at > existing.created_at) {
        latestByVenue.set(key, s);
      }
    }

    // 4. Filter: delta window + optional venue substring + must have entries
    type Work = { key: string; submission: BusinessSubmission; entries: TechStackEntry[] };
    const venuesToProcess: Work[] = [];
    for (const [key, submission] of latestByVenue) {
      if (onlyVenueQuery && !key.includes(onlyVenueQuery)) continue;
      const submittedMs = new Date(submission.created_at).getTime();
      if (!Number.isFinite(submittedMs) || submittedMs < sinceMs) continue;
      const subEntries = entriesBySubmission.get(submission.id) || [];
      if (subEntries.length === 0) continue;
      venuesToProcess.push({ key, submission, entries: subEntries });
    }

    // Nothing to do — return early without touching Airtable
    if (venuesToProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        dry,
        mode: full ? 'full' : 'delta',
        sinceIso: full ? null : new Date(sinceMs).toISOString(),
        onlyVenue: onlyVenueQuery,
        venuesProcessed: 0,
        note: 'No venues matched the delta window',
      });
    }

    // 5. Fetch Airtable state — include Tool + Category so we can compare rows
    const [airtableVenues, airtablePartners, airtableTechUsage] = await Promise.all([
      airtableFetchAll(VENUES_TABLE, ['Venue', 'Industry', 'Region']),
      airtableFetchAll(PARTNERS_TABLE, ['Name']),
      airtableFetchAll(TECH_USAGE_TABLE, ['Source', 'Venue', 'Tool', 'Category']),
    ]);

    // venue name → record id (for wipe + link)
    const venueIdByKey = new Map<string, string>();
    // venue name → existing Industry/Region (for "only fill empty" update logic)
    const venueMetaByKey = new Map<string, { industry?: string; region?: string }>();
    for (const v of airtableVenues) {
      const name = (v.fields.Venue as string | undefined)?.trim();
      if (!name) continue;
      const key = normalizeName(name);
      venueIdByKey.set(key, v.id);
      venueMetaByKey.set(key, {
        industry: (v.fields.Industry as string | undefined)?.trim() || undefined,
        region: (v.fields.Region as string | undefined)?.trim() || undefined,
      });
    }

    // partner id + matching patterns
    const partnerIndex = airtablePartners
      .map((p) => ({
        id: p.id,
        name: (p.fields.Name as string | undefined)?.trim() || '',
      }))
      .filter((p) => p.name)
      .map((p) => ({
        id: p.id,
        patterns: termPatterns(matchTermsForPartner(p.name)),
      }));

    // venue record id → old Tech Usage rows (Source=Self-reported only) with dedupe keys
    type OldTuRow = { id: string; dedupeKey: string };
    const oldTuByVenueId = new Map<string, OldTuRow[]>();
    for (const tu of airtableTechUsage) {
      const src = tu.fields.Source;
      const sourceName = typeof src === 'string' ? src : (src as { name?: string } | undefined)?.name;
      if (sourceName !== SOURCE_LABEL) continue;
      const venueIds = tu.fields.Venue as string[] | undefined;
      const venueId = venueIds?.[0];
      if (!venueId) continue;
      const tool = String(tu.fields.Tool ?? '').trim().toLowerCase();
      const catRaw = tu.fields.Category;
      const catName = typeof catRaw === 'string' ? catRaw : (catRaw as { name?: string } | undefined)?.name || 'Other';
      const arr = oldTuByVenueId.get(venueId) || [];
      arr.push({ id: tu.id, dedupeKey: `${catName}|${tool}` });
      oldTuByVenueId.set(venueId, arr);
    }

    // 6. Per-venue plan + execute (idempotent: skip venues whose current rows match target)
    const START = Date.now();
    const BUDGET_MS = 20_000; // Netlify's Next.js API route hard-timeout is ~26s; keep buffer

    let venuesCreated = 0;
    let venuesUpdated = 0;
    let venuesConverged = 0;
    let venuesInSync = 0;
    let venuesDeferred = 0;
    let techUsageDeleted = 0;
    let techUsageCreated = 0;
    const unmatchedTools = new Map<string, number>();

    for (const { key, submission, entries: subEntries } of venuesToProcess) {
      // Budget check — leave time for the HTTP response
      if (Date.now() - START > BUDGET_MS) {
        venuesDeferred++;
        continue;
      }

      const venueName = submission.business_name!.trim();
      const industry =
        submission.industry?.trim() || submission.vertical?.trim() || undefined;
      const region = submission.location?.trim() || undefined;
      let venueId = venueIdByKey.get(key);

      // Step 1: ensure venue exists
      if (!venueId) {
        const fields: Record<string, unknown> = { Venue: venueName };
        if (industry) fields.Industry = industry;
        if (region) fields.Region = region;
        if (!dry) {
          const created = await airtableCreate(VENUES_TABLE, [{ fields }]);
          venueId = created[0]?.id;
          if (venueId) {
            venueIdByKey.set(key, venueId);
            venueMetaByKey.set(key, { industry, region });
          }
        }
        venuesCreated++;
        if (!venueId) continue; // dry mode — can't create TU rows without an id
      } else {
        // Fill empty Industry/Region only — never overwrite hand-enriched values
        const meta = venueMetaByKey.get(key) || {};
        const patch: Record<string, unknown> = {};
        if (industry && !meta.industry) patch.Industry = industry;
        if (region && !meta.region) patch.Region = region;
        if (Object.keys(patch).length > 0) {
          if (!dry) await airtableUpdate(VENUES_TABLE, [{ id: venueId, fields: patch }]);
          venuesUpdated++;
        }
      }

      // Step 2: build target rows for this venue
      const targetRows = buildTechUsageRows(
        venueId,
        venueName,
        submission,
        subEntries,
        partnerIndex,
      );
      for (const row of targetRows) {
        if (!row.fields.Partner) {
          const tool = String(row.fields.Tool ?? '').toLowerCase();
          unmatchedTools.set(tool, (unmatchedTools.get(tool) ?? 0) + 1);
        }
      }

      // Step 3: idempotent diff
      // - Only CREATE rows whose key isn't already present (safe against duplicates from
      //   prior partial runs)
      // - DELETE rows whose key isn't in target, PLUS duplicates within a key (keep one)
      // If both sides are empty → skip.
      const currentRows = oldTuByVenueId.get(venueId) || [];
      const currentByKey = new Map<string, string[]>();
      for (const r of currentRows) {
        const arr = currentByKey.get(r.dedupeKey) || [];
        arr.push(r.id);
        currentByKey.set(r.dedupeKey, arr);
      }
      const targetKeys = new Set(
        targetRows.map((r) => {
          const cat = String(r.fields.Category ?? 'Other');
          const tool = String(r.fields.Tool ?? '').trim().toLowerCase();
          return `${cat}|${tool}`;
        }),
      );

      const rowsToCreate = targetRows.filter((r) => {
        const cat = String(r.fields.Category ?? 'Other');
        const tool = String(r.fields.Tool ?? '').trim().toLowerCase();
        return !currentByKey.has(`${cat}|${tool}`);
      });

      const idsToDelete: string[] = [];
      for (const [key, ids] of currentByKey) {
        if (!targetKeys.has(key)) {
          // Key not in target — delete all rows with this key
          idsToDelete.push(...ids);
        } else if (ids.length > 1) {
          // Duplicates from a prior partial run — keep one, delete the rest
          idsToDelete.push(...ids.slice(1));
        }
      }

      if (rowsToCreate.length === 0 && idsToDelete.length === 0) {
        venuesInSync++;
        continue;
      }

      // Step 4: create-then-delete (temp duplicates preferred over temp zero rows)
      if (!dry) {
        if (rowsToCreate.length > 0) {
          await airtableCreate(TECH_USAGE_TABLE, rowsToCreate);
        }
        if (idsToDelete.length > 0) {
          await airtableDelete(TECH_USAGE_TABLE, idsToDelete);
        }
      }
      techUsageCreated += rowsToCreate.length;
      techUsageDeleted += idsToDelete.length;
      venuesConverged++;
    }

    // Top 20 unmatched tools — feed into PARTNER_VENDOR_ALIASES if any are actually partners
    const topUnmatched = Array.from(unmatchedTools.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tool, count]) => ({ tool, count }));

    return NextResponse.json({
      ok: true,
      dry,
      mode: full ? 'full' : 'delta',
      sinceIso: full ? null : new Date(sinceMs).toISOString(),
      onlyVenue: onlyVenueQuery,
      elapsedMs: Date.now() - START,
      venuesProcessed: venuesToProcess.length,
      venuesConverged,
      venuesInSync,
      venuesCreated,
      venuesUpdated,
      venuesDeferred,
      techUsageDeleted,
      techUsageCreated,
      topUnmatchedTools: topUnmatched,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

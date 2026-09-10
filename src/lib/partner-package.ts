// Reads a partner's tier from the Package field on the marketplace Partners
// table (TOT Website base) — the same table the SOS sync already writes to,
// so this needs no new credentials.
//
//   Lite     — listed on the marketplace only. No dashboard data beyond
//              Intelligence if they somehow hold a link.
//   Promote  — £249/mo. All the Intelligence, pipeline counts, no lead detail.
//   Approved — £1,000/mo. Everything, leads by name.
//
// Package is where the commercial tier already lives and where the team
// already maintains it, so the portal follows it rather than keeping a second
// copy. PARTNER_TIERS stays as a manual override for anything urgent.

import type { PartnerTier } from './partner-tier';
import { envTierForSlug } from './partner-tier';
import { canonicalPartnerSlug } from './airtable';

const MP_BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID;
const MP_TABLE = process.env.MARKETPLACE_PARTNERS_TABLE || 'Partners';
const MP_KEY = process.env.MARKETPLACE_AIRTABLE_KEY;

const CACHE_TTL_MS = 5 * 60 * 1000;

// Last known good, kept indefinitely. A refresh only replaces it on success,
// so an Airtable blip doesn't quietly downgrade every paying partner — it
// just serves slightly stale tiers until the next read lands.
let cached: Map<string, PartnerTier> | null = null;
let cachedAt = 0;
let inflight: Promise<Map<string, PartnerTier> | null> | null = null;

function toTier(pkg: unknown): PartnerTier {
  // Only Approved unlocks lead detail. Promote and Lite don't, and neither
  // does an unrecognised value.
  return typeof pkg === 'string' && pkg.trim().toLowerCase() === 'approved'
    ? 'approved'
    : 'promote';
}

async function fetchPackages(): Promise<Map<string, PartnerTier> | null> {
  if (!MP_BASE || !MP_KEY) {
    console.warn('[partner-package] MARKETPLACE_AIRTABLE_* not configured — falling back');
    return null;
  }

  const map = new Map<string, PartnerTier>();
  let offset: string | undefined;

  try {
    do {
      const url = new URL(`https://api.airtable.com/v0/${MP_BASE}/${encodeURIComponent(MP_TABLE)}`);
      url.searchParams.set('pageSize', '100');
      url.searchParams.append('fields[]', 'Slug');
      url.searchParams.append('fields[]', 'Package');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${MP_KEY}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        console.warn(`[partner-package] Airtable ${res.status} — falling back`);
        return null;
      }

      const json = (await res.json()) as {
        records?: { fields?: { Slug?: string; Package?: string } }[];
        offset?: string;
      };
      for (const r of json.records || []) {
        const slug = (r.fields?.Slug || '').trim().toLowerCase();
        if (slug) map.set(slug, toTier(r.fields?.Package));
      }
      offset = json.offset;
    } while (offset);
  } catch (err) {
    console.warn('[partner-package] read failed — falling back', err);
    return null;
  }

  return map;
}

async function packageMap(): Promise<Map<string, PartnerTier> | null> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  // One read at a time: a burst of page loads shouldn't become a burst of
  // Airtable calls.
  if (!inflight) {
    inflight = fetchPackages().finally(() => {
      inflight = null;
    });
  }
  const fresh = await inflight;
  if (fresh) {
    cached = fresh;
    cachedAt = Date.now();
  }
  return cached;
}

/**
 * The tier that governs what a partner's own dashboard shows.
 *
 * Order: the PARTNER_TIERS override, then the Package field, then Promote.
 * That last step is deliberate — an unknown partner is gated rather than
 * handed the £1,000 view, and the tier badge on the internal page makes a
 * wrong answer visible to the team straight away.
 */
export async function tierForSlug(slug: string): Promise<PartnerTier> {
  const override = envTierForSlug(slug);
  if (override) return override;

  const map = await packageMap();
  if (!map) return 'promote';

  // A partner's link can be issued on one spelling while the marketplace row
  // uses another — Planday's link says `planday`, the Package row says
  // `planday-from-xero`. Without canonicalising, the lookup misses and an
  // Approved partner silently drops to Promote.
  const asked = slug.trim().toLowerCase();
  const tier = map.get(asked) ?? map.get(canonicalPartnerSlug(asked));
  if (tier) return tier;

  console.warn(`[partner-package] no Package for slug "${slug}" — gating lead detail`);
  return 'promote';
}

// Partner tiers.
//
//   approved — £1,000/mo. Everything: Intelligence plus every lead, by name.
//   promote  — £249/mo. All the Intelligence, and their pipeline numbers, but
//              not who the leads are. Lite sits here too.
//
// The tier itself comes from the Package field on the marketplace Partners
// table — see partner-package.ts. This file holds only what's safe to import
// from a client component: the type, the upgrade link, and the manual
// override map.
//
// The gate these drive is enforced on the server, in the routes that build
// the payload — never in the browser. A partner paying £249 must not be able
// to open devtools and read the £1,000 tier out of a network response.

export type PartnerTier = 'promote' | 'approved';

/** Where the locked panel sends someone who wants the full tier. */
export const UPGRADE_URL =
  process.env.NEXT_PUBLIC_UPGRADE_URL ||
  'https://www.wearestacked.io/choose-character/for-tech-partners';

/** The one thing the tier actually decides. */
export function canSeeLeadDetail(tier: PartnerTier): boolean {
  return tier === 'approved';
}

/**
 * Manual override, ahead of Airtable: PARTNER_TIERS='{"slug":"approved"}'.
 *
 * Airtable's Package field is the source of truth, so this should normally be
 * empty. It exists so a mis-set or missing Package can be corrected in one env
 * edit without waiting on the CRM, in either direction.
 *
 * Returns null when the slug isn't listed, which means "ask Airtable".
 */
export function envTierForSlug(slug: string): PartnerTier | null {
  let map: Record<string, string>;
  try {
    map = JSON.parse(process.env.PARTNER_TIERS || '{}');
  } catch {
    return null;
  }
  const value = map[slug];
  if (value === 'promote') return 'promote';
  if (value === 'approved') return 'approved';
  return null;
}

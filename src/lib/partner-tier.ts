// Partner tiers.
//
//   approved — £1,000/mo. Everything: Intelligence plus every lead, by name.
//   promote  — £249/mo. All the Intelligence, and their pipeline numbers, but
//              not who the leads are.
//
// The tier lives in PARTNER_TIERS, a JSON slug→tier map, alongside the
// PARTNER_TOKENS and PARTNER_PASSCODES maps this app already runs on. Absent
// means `approved`, so every partner on the platform today is unaffected and
// putting someone on Promote is one env edit, same as issuing their link.
//
//   PARTNER_TIERS='{"some-partner":"promote"}'
//
// The gate this drives is enforced on the server, in the routes that build
// the payload — never in the browser. A partner paying £249 must not be able
// to open devtools and read the £1,000 tier out of a network response.

export type PartnerTier = 'promote' | 'approved';

/** Where the locked panel sends someone who wants the full tier. */
export const UPGRADE_URL =
  process.env.NEXT_PUBLIC_UPGRADE_URL ||
  'https://www.wearestacked.io/choose-character/for-tech-partners';

function tierMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.PARTNER_TIERS || '{}');
  } catch {
    return {};
  }
}

export function tierForSlug(slug: string): PartnerTier {
  return tierMap()[slug] === 'promote' ? 'promote' : 'approved';
}

/** The one thing the tier actually decides. */
export function canSeeLeadDetail(tier: PartnerTier): boolean {
  return tier === 'approved';
}

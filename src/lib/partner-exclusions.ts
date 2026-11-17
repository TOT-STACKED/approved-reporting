// Partners that are deliberately kept out of parts of the portal. Slugs are
// the canonical partner slugs (see canonicalPartnerSlug in ./airtable) plus
// any other spelling the lead sheet uses, so a match never depends on which
// alias a tag or link happened to use.

/**
 * Removed from the platform entirely (17 Nov 2026, Chris's call): no partner
 * page, no sign-in, no link, and their tags are ignored on every lead, so
 * they appear in no team view, total or other partner's data.
 */
const REMOVED = new Set(['zenzap']);

/**
 * Separate deal, not part of the partner programme (17 Nov 2026). Their own
 * partner page and sign-in stay live, but they're stripped from everything
 * the team sees: partner lists, the league, heat map, pipeline totals,
 * leads, the digest and the Ask assistant.
 */
const INTERNAL_EXCLUDED = new Set(['sky', 'sky-business']);

const key = (slug: string) => slug.trim().toLowerCase();

export function isRemovedPartner(slug: string | null | undefined): boolean {
  return !!slug && REMOVED.has(key(slug));
}

/** True for partners the team's views should never show (removed ones too). */
export function isHiddenFromTeam(slug: string | null | undefined): boolean {
  return !!slug && (REMOVED.has(key(slug)) || INTERNAL_EXCLUDED.has(key(slug)));
}

/** A lead-sheet stage tag as a slug: "Planday by Xero" -> "planday-by-xero". */
export function tagSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
}

// The venue marketplace — Promote partners see which venues run which
// tech. Never contact details: a reveal shows the venue's trading name and its
// stack, nothing that would let someone skip past Stacked to the operator.
//
// Safe to import from client components: plans, prices and labels only. What a
// viewer is allowed to see is decided on the server, in venues.ts.

export const CATEGORIES = [
  'pos',
  'payments',
  'workforce',
  'inventory',
  'loyalty',
  'learning',
  'finance_ops',
  'guest_feedback',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  pos: 'POS',
  payments: 'Payments',
  workforce: 'Workforce',
  inventory: 'Inventory',
  loyalty: 'Loyalty',
  learning: 'Learning',
  finance_ops: 'Finance ops',
  guest_feedback: 'Guest feedback',
};

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

// Venues is part of the Promote package (£249/mo) and nothing else: no
// pay-as-you-go plans, no top-ups. Lite and Approved partners don't get it.
//
// Each calendar month a Promote partner gets 5 reveals (one token, one venue)
// and picks up to 5 categories to see on the venues they reveal. The choice is
// made the first time they sign in that month and holds until the 1st.
export type PlanId = 'promote';

export const PROMOTE = {
  id: 'promote' as const,
  name: 'Promote',
  reveals: 5,
  maxCategories: 5,
  insights: true, // NPS scores, gaps, the "unhappy with their tool" filter
};

/** A score at or below this counts as "unhappy" — NPS detractor territory. */
export const UNHAPPY_MAX = 6;

export const VENUE_TYPE_LABELS: Record<string, string> = {
  qsr: 'QSR',
  group: 'Restaurant group',
  bar: 'Bar / pub',
  indie: 'Independent',
  hotel: 'Hotel',
  other: 'Other',
};

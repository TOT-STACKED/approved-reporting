// The venue marketplace — tech partners pay to see which venues run which
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

//   Starter — £10/mo, 5 reveals a month, one category; +£10/mo per extra category.
//   Bundle  — £49/mo, 25 reveals a month, every category, plus NPS scores and
//             gaps (where a venue has no tool at all — the buying signal).
//   Partner — Approved partners get the Bundle as part of their package.
//
// No unlimited plan on purpose: with ~200 venues it would hand over the whole
// dataset for one month's fee. Revisit when the pool passes ~500.
export type PlanId = 'starter' | 'bundle' | 'partner';

export interface PlanSpec {
  id: PlanId;
  name: string;
  pricePence: number;
  reveals: number;
  allCategories: boolean;
  insights: boolean; // NPS scores, gaps, the "unhappy with their tool" filter
}

export const PLANS: Record<PlanId, PlanSpec> = {
  starter: { id: 'starter', name: 'Starter', pricePence: 1000, reveals: 5, allCategories: false, insights: false },
  bundle: { id: 'bundle', name: 'Bundle', pricePence: 4900, reveals: 25, allCategories: true, insights: true },
  partner: { id: 'partner', name: 'Approved partner', pricePence: 0, reveals: 25, allCategories: true, insights: true },
};

export const EXTRA_CATEGORY_PENCE = 1000;
export const TOPUP_PENCE = 1000;
export const TOPUP_REVEALS = 5;

/** A score at or below this counts as "unhappy" — NPS detractor territory. */
export const UNHAPPY_MAX = 6;

/** Monthly price of a Starter plan with `n` categories. */
export function starterPricePence(n: number): number {
  return PLANS.starter.pricePence + Math.max(0, n - 1) * EXTRA_CATEGORY_PENCE;
}

export function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

export const VENUE_TYPE_LABELS: Record<string, string> = {
  qsr: 'QSR',
  group: 'Restaurant group',
  bar: 'Bar / pub',
  indie: 'Independent',
  hotel: 'Hotel',
  other: 'Other',
};

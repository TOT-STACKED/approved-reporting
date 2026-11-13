// Operator ratings from Stacked Intelligence, for Renewals. Every Intelligence
// Review asks the operator to rate each tool they use from 0 to 10. Pooled,
// those ratings say how operators who actually use a product rate it, which is
// what an operator weighing a renewal or a quote wants next to the price.
//
// Safe to import from client components: types, matching and search only. The
// pooling runs on the server (renewals-ratings.ts) and only ever sends
// aggregates: no venue, person or single review is identifiable from it.
//
// Neutral by design: there's no leaderboard. An operator sees ratings for the
// products they pick or already use, never a "top products" list.

import { RENEWAL_CATEGORY_LABELS, isRenewalCategory } from './renewals-shared';

/** Fewer ratings than this and the average isn't shown: too easy to skew, and too close to one venue's view. */
export const MIN_RATINGS = 3;

export interface ProductRating {
  /** `${category}:${key}` — stable for the same product in the same category. */
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  /** How many operators rated it. */
  n: number;
  /** Average 0–10, one decimal. Null below MIN_RATINGS. */
  avg: number | null;
  /** Share who rated it 9 or 10, as a whole percent. Null below MIN_RATINGS. */
  topPct: number | null;
}

export interface RatingsDirectory {
  products: ProductRating[];
  /** Intelligence Reviews the ratings come from. */
  reviews: number;
  /** Average rating of every product in a category, for context. */
  categoryAvg: Record<string, number>;
}

const REVIEW_LABELS: Record<string, string> = {
  pos: 'POS',
  payments: 'Payments',
  workforce: 'People',
  inventory: 'Inventory',
  loyalty: 'Loyalty & CRM',
  learning: 'Learning',
  finance_ops: 'Finance',
  guest_feedback: 'Guest feedback',
};

export function categoryLabel(id: string): string {
  return REVIEW_LABELS[id] || (isRenewalCategory(id) ? RENEWAL_CATEGORY_LABELS[id] : id);
}

// Words that say what kind of company or product it is, not which one.
const GENERIC = new Set([
  'ltd', 'limited', 'plc', 'llp', 'inc', 'uk', 'the', 'group', 'systems', 'system', 'software', 'technologies',
  'technology', 'tech', 'app', 'apps', 'epos', 'pos', 'platform', 'solutions', 'hq', 'co', 'and', '&',
]);

export function nameTokens(s: string | null | undefined): string[] {
  return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !GENERIC.has(t));
}

export function productKey(s: string): string {
  return nameTokens(s).join(' ');
}

function startsWith(hay: string[], needle: string[]): boolean {
  return needle.length > 0 && needle.length <= hay.length && needle.every((t, i) => hay[i] === t);
}

/**
 * The rated product a tool most likely is, from its name or supplier. Exact
 * names win, then a rated name the tool's name starts with ("Square" for
 * "Square for Restaurants"), preferring the tool's own category and the
 * longest match ("Lightspeed Payments" over "Lightspeed").
 */
export function matchProduct(
  dir: RatingsDirectory,
  name: string | null | undefined,
  supplier?: string | null,
  category?: string | null
): ProductRating | null {
  const candidates = [nameTokens(name), nameTokens(supplier)].filter(t => t.length);
  if (!candidates.length) return null;
  let best: { p: ProductRating; score: number } | null = null;
  for (const p of dir.products) {
    const key = nameTokens(p.name);
    if (!key.length || key.join('').length < 3) continue;
    let score = 0;
    for (const [i, c] of candidates.entries()) {
      const weight = i === 0 ? 2 : 1;
      if (c.join(' ') === key.join(' ')) score = Math.max(score, 100 * weight);
      else if (startsWith(c, key)) score = Math.max(score, (40 + key.length * 5) * weight);
    }
    if (!score) continue;
    if (category && p.category === category) score += 30;
    score += Math.min(p.n, 20) / 10; // tie-break towards the better-evidenced entry
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}

/** Products whose name contains what was typed, best-evidenced first. */
export function searchProducts(dir: RatingsDirectory, q: string, limit = 8): ProductRating[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  return dir.products
    .filter(p => p.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return as - bs || b.n - a.n || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

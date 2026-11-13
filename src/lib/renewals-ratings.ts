// Pools every Intelligence Review's 0–10 product ratings into one directory of
// averages. Server only: it reads every submission's stack with the service
// role, and sends nothing but aggregates on. See renewals-ratings-shared.ts.

import { REVIEW_CATEGORIES } from './intelligence-review';
import { MIN_RATINGS, categoryLabel, productKey, type ProductRating, type RatingsDirectory } from './renewals-ratings-shared';

const URL_ = process.env.VENUES_SUPABASE_URL;
const KEY = process.env.VENUES_SUPABASE_KEY;

const CACHE_MS = 15 * 60 * 1000;
let cache: { at: number; dir: RatingsDirectory } | null = null;

type StackRow = { stack: Record<string, { nps?: Record<string, unknown> } | null> | null };

const LISTED = new Map<string, Map<string, string>>(
  REVIEW_CATEGORIES.map(c => [c.id, new Map(c.options.map(o => [productKey(o), o]))])
);

async function loadStacks(): Promise<StackRow[]> {
  if (!URL_ || !KEY) throw new Error('VENUES_SUPABASE_URL / VENUES_SUPABASE_KEY not set');
  const res = await fetch(`${URL_}/rest/v1/submissions?select=stack&stack=not.is.null&limit=20000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`supabase ${res.status} loading ratings`);
  return res.json();
}

export function buildDirectory(rows: StackRow[]): RatingsDirectory {
  const groups = new Map<string, { category: string; scores: number[]; spellings: Map<string, number>; listed: string | null }>();
  const catScores = new Map<string, number[]>();
  let reviews = 0;

  for (const row of rows) {
    let rated = false;
    for (const [category, entry] of Object.entries(row.stack || {})) {
      for (const [rawKey, raw] of Object.entries(entry?.nps || {})) {
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 10) continue;
        const name = (rawKey.startsWith('__other__:') ? rawKey.slice('__other__:'.length) : rawKey).trim();
        const key = productKey(name);
        // Typed-in names can be sentences ("we don't have one but…"): keep only things that look like a product name.
        if (!key || name.length > 40 || name.split(/\s+/).length > 5) continue;
        const id = `${category}:${key}`;
        const g = groups.get(id) || { category, scores: [] as number[], spellings: new Map<string, number>(), listed: LISTED.get(category)?.get(key) ?? null };
        g.scores.push(raw);
        g.spellings.set(name, (g.spellings.get(name) || 0) + 1);
        groups.set(id, g);
        catScores.set(category, [...(catScores.get(category) || []), raw]);
        rated = true;
      }
    }
    if (rated) reviews++;
  }

  const products: ProductRating[] = [];
  for (const [id, g] of groups) {
    const n = g.scores.length;
    // A typed-in name only a couple of operators used is noise; a listed product still shows, as "not enough ratings yet".
    if (!g.listed && n < MIN_RATINGS) continue;
    const name = g.listed || [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const enough = n >= MIN_RATINGS;
    products.push({
      id,
      name,
      category: g.category,
      categoryLabel: categoryLabel(g.category),
      n,
      avg: enough ? Math.round((g.scores.reduce((s, x) => s + x, 0) / n) * 10) / 10 : null,
      topPct: enough ? Math.round((g.scores.filter(x => x >= 9).length / n) * 100) : null,
    });
  }
  products.sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));

  const categoryAvg: Record<string, number> = {};
  for (const [c, s] of catScores) categoryAvg[c] = Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10;

  return { products, reviews, categoryAvg };
}

/** The pooled ratings, cached for a while: they change only as new reviews come in. */
export async function ratingsDirectory(): Promise<RatingsDirectory> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.dir;
  const dir = buildDirectory(await loadStacks());
  cache = { at: Date.now(), dir };
  return dir;
}

/** Same, but an empty directory rather than an error, so a ratings hiccup never takes a page down. */
export async function ratingsDirectorySafe(): Promise<RatingsDirectory> {
  try {
    return await ratingsDirectory();
  } catch (err) {
    console.warn('[renewals] ratings unavailable', err);
    return { products: [], reviews: 0, categoryAvg: {} };
  }
}

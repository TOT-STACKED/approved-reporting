// Measures how often an NPS score fails to attach to a tool the operator
// actually picked — the "extraNps" rate.
//
// Why this exists: the weakest-tool flag routes on CATEGORY, and the only
// trustworthy category comes from tech_stack_entries (what the operator chose
// in the form). A score is joined to that entry by exact normalised vendor
// name. When the join misses, the score survives but its category is whatever
// the review row happened to carry — often nothing. So the failure rate of
// that join is the ceiling on how reliable category-based routing can be.
//
// The matching logic below is a copy of src/app/api/tech-check/route.ts.
// If that changes, change this too, or the number stops meaning anything.
//
// Run:
//   STACKCOLLECT_SUPABASE_URL="$(netlify env:get STACKCOLLECT_SUPABASE_URL)" \
//   STACKCOLLECT_SUPABASE_KEY="$(netlify env:get STACKCOLLECT_SUPABASE_KEY)" \
//   node scripts/match-rate.mjs

const URL_ = process.env.STACKCOLLECT_SUPABASE_URL;
const KEY = process.env.STACKCOLLECT_SUPABASE_KEY;

if (!URL_ || !KEY) {
  console.error(
    'Set STACKCOLLECT_SUPABASE_URL and STACKCOLLECT_SUPABASE_KEY first.\n' +
      'Both are in Netlify → approved-reporting → Environment variables,\n' +
      'or pull them inline with `netlify env:get` as in the header comment.'
  );
  process.exit(1);
}

async function all(table, select) {
  const out = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const res = await fetch(
      `${URL_}/rest/v1/${table}?select=${select}&limit=${page}&offset=${offset}`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!res.ok) {
      console.error(`${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < page) break;
    offset += page;
  }
  return out;
}

const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');

const [nps, entries, biz] = await Promise.all([
  all('nps_scores', 'id,score,vendor,category,submission_id,external_id,company'),
  all('tech_stack_entries', 'submission_id,tool_name,category'),
  all('business_submissions', 'id,business_name'),
]);

console.log(
  `nps_scores=${nps.length}  tech_stack_entries=${entries.length}  business_submissions=${biz.length}`
);

const entBySub = new Map();
for (const e of entries) {
  if (!entBySub.has(e.submission_id)) entBySub.set(e.submission_id, []);
  entBySub.get(e.submission_id).push(e);
}

// Attribution: by submission_id/external_id first, then company-name fallback.
const npsById = new Map();
const npsByCompany = new Map();
for (const n of nps) {
  const k = n.submission_id || n.external_id;
  if (k) {
    if (!npsById.has(k)) npsById.set(k, []);
    npsById.get(k).push(n);
  }
  const c = norm(n.company);
  if (c) {
    if (!npsByCompany.has(c)) npsByCompany.set(c, []);
    npsByCompany.get(c).push(n);
  }
}

let attributed = 0;
let matched = 0;
let extra = 0;
let extraWithCat = 0;
let extraNoCat = 0;
const attributedIds = new Set();
const unmatchedVendors = new Map();

for (const b of biz) {
  const bizEntries = entBySub.get(b.id) || [];
  if (!bizEntries.length) continue;

  const seen = new Set();
  const mine = [];
  for (const n of [
    ...(npsById.get(b.id) || []),
    ...(npsByCompany.get(norm(b.business_name)) || []),
  ]) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    mine.push(n);
  }

  const toolNorms = new Set(bizEntries.map(e => norm(e.tool_name)));
  for (const n of mine) {
    attributed++;
    attributedIds.add(n.id);
    if (toolNorms.has(norm(n.vendor))) {
      matched++;
    } else if (typeof n.score === 'number' && n.vendor) {
      extra++;
      if (n.category && String(n.category).trim()) extraWithCat++;
      else extraNoCat++;
      unmatchedVendors.set(n.vendor, (unmatchedVendors.get(n.vendor) || 0) + 1);
    }
  }
}

console.log('\n--- attribution ---');
console.log(`attributed to a venue that has tools : ${attributed}`);
console.log(`not attributed to any such venue     : ${nps.length - attributedIds.size}`);

console.log('\n--- the number ---');
console.log(`matched to a picked tool : ${matched}  (${pct(matched, attributed)})`);
console.log(`fell into extraNps       : ${extra}  (${pct(extra, attributed)})`);
console.log(`  ...carrying a category : ${extraWithCat}  (${pct(extraWithCat, extra)} of extras)`);
console.log(`  ...with NO category    : ${extraNoCat}  (${pct(extraNoCat, extra)} of extras)`);

console.log('\n--- most common unmatched vendor names ---');
[...unmatchedVendors.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([v, c]) => console.log(`  ${String(c).padStart(3)}  ${v}`));

// Score distribution, so the low threshold is picked from the data rather
// than asserted. Cumulative column answers "how many tools would flag at <= n".
const dist = new Array(11).fill(0);
let n0 = 0;
for (const n of nps) {
  if (typeof n.score === 'number' && n.score >= 0 && n.score <= 10) {
    dist[Math.round(n.score)]++;
    n0++;
  }
}
console.log(`\n--- score distribution (n=${n0}) ---`);
let cum = 0;
dist.forEach((c, s) => {
  cum += c;
  console.log(
    `  ${String(s).padStart(2)}: ${String(c).padStart(4)}  ${pct(c, n0).padStart(6)}` +
      `   flagged if threshold is <=${s}: ${pct(cum, n0)}`
  );
});

// ---------------------------------------------------------------
// How many operators would actually trip the internal alert.
// The flag is per-operator, not per-score: "3+ tools at or below
// the threshold". A threshold that looks loud per-rating can still
// be quiet per-operator, and it's the per-operator number that
// decides whether anyone drowns.
// ---------------------------------------------------------------
const scoresBySub = new Map();
for (const b of biz) {
  const bizEntries = entBySub.get(b.id) || [];
  if (!bizEntries.length) continue;
  const seen = new Set();
  const mine = [];
  for (const n of [
    ...(npsById.get(b.id) || []),
    ...(npsByCompany.get(norm(b.business_name)) || []),
  ]) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    mine.push(n);
  }
  const scored = mine.filter(n => typeof n.score === 'number');
  if (scored.length) scoresBySub.set(b.id, scored.map(n => n.score));
}

console.log(`\n--- operators with any score: ${scoresBySub.size} ---`);
console.log('threshold   1+ low    2+ low    3+ low (alerts)');
for (const t of [3, 4, 5, 6, 7]) {
  const c = [0, 0, 0];
  for (const scores of scoresBySub.values()) {
    const low = scores.filter(s => s <= t).length;
    if (low >= 1) c[0]++;
    if (low >= 2) c[1]++;
    if (low >= 3) c[2]++;
  }
  const f = (n) => `${String(n).padStart(3)} (${pct(n, scoresBySub.size).padStart(5)})`;
  console.log(`   <=${t}     ${f(c[0])}  ${f(c[1])}  ${f(c[2])}`);
}

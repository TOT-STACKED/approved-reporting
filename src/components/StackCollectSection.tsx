// Per-partner Intelligence block (marketplace presence). Shared between the internal /partners/[slug]
// page and the partner-facing /p/[token] page so they stay in sync. The
// numbers all come pre-computed from getPartnerStackCollectData — this file
// is pure presentation.

import { scoreTone } from './VendorScoreDashboard';

// Type inlined here (not imported) so the component builds even if the
// stackcollect.ts on GitHub is briefly out of sync. Fields beyond `mentions`
// are optional so an older API response (without trend/rankings/competitors)
// still renders cleanly.
interface PartnerStackData {
  mentions: number;
  uniqueReviewsWithPartner?: number;
  categories: { category: string; count: number }[];
  totalReviews: number;
  totalReviewsOnPlatform?: number;
  marketShare: string;
  monthlyMentions?: { month: string; count: number }[];
  categoryRankings?: {
    category: string;
    partnerCount: number;
    totalSelections: number;
    rank: number;
    totalTools: number;
    leader: { tool: string; count: number };
    shareInCategory: number;
  }[];
  topCompetitors?: { tool: string; count: number; sharedCategories: number }[];
  // Distinct operator brands, read off the marketplace Partners record by
  // getPartnerStackCollectData so this page shows the identical figure to the
  // public marketplace tile. Optional like the rest: an older API response
  // simply falls back to the review-based count.
  marketplaceOperators?: number | null;
  marketplaceVenues?: number | null;
}

// Per-category operator score, from getPartnerScoreIntelligence. Optional and
// keyed by the same category labels the marketplace rankings use, so a partner
// with no ratings in a category simply gets a dash rather than a missing row.
interface CategoryScore {
  category: string;
  sos: number;
  count: number;
  categoryAverage: number;
  // Rank here is by SCORE, not by how often the tool is picked: position
  // among the vendors in this category with enough ratings to rank.
  rank: number;
  totalRanked: number;
  leaderSos: number | null;
  leaderName: string | null;
  // Rank and leader recomputed at a five-review minimum. Null when this
  // partner's own sample in the category is below that.
  strict: {
    rank: number;
    totalRanked: number;
    leaderSos: number | null;
    leaderName: string | null;
  } | null;
}

interface Props {
  partnerName: string;
  data: PartnerStackData;
  categoryScores?: CategoryScore[];
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

// Builds the top-of-section sentence. Summarises the table below it — the
// score rankings — rather than the adoption figures, which the KPI tiles
// already carry. Falls back gracefully when a partner has no ratings yet.
function buildHeadline(
  partnerName: string,
  d: PartnerStackData,
  rated: { category: string; cs: CategoryScore }[]
): string {
  if (d.uniqueReviewsWithPartner === 0) {
    return `${partnerName} hasn't been selected in any intelligence reviews yet.`;
  }

  // Best rank first: a partner reads their strongest category as the headline
  // and the weakest as the thing to fix.
  const ranked = rated
    .filter(r => (r.cs.strict?.rank ?? 0) > 0)
    .sort((a, b) => (a.cs.strict!.rank) - (b.cs.strict!.rank))
    .slice(0, 2);

  const place = (r: { category: string; cs: CategoryScore }) =>
    `#${r.cs.strict!.rank} of ${r.cs.strict!.totalRanked} in ${r.category}`;

  const catPhrase = ranked.length === 0
    ? ''
    : ranked.length === 1
      ? ` On operator score, ${partnerName} ranks ${place(ranked[0])}.`
      : ` On operator score, ${partnerName} ranks ${place(ranked[0])} and ${place(ranked[1])}.`;
  // Operator brands lead when we have them: that's the figure on the public
  // marketplace tile, so it's the one a partner cross-checks first. The rest
  // of the sentence is explicitly review-based — the two are different units
  // and used to be conflated under the single word "operators".
  const ops = typeof d.marketplaceOperators === 'number' ? d.marketplaceOperators : null;
  const opsPhrase = ops !== null
    ? `${partnerName} is used by ${ops} operator brand${ops === 1 ? '' : 's'} on the marketplace. Chosen in`
    : `${partnerName} was chosen in`;
  return `${opsPhrase} ${d.uniqueReviewsWithPartner} of ${d.totalReviews} intelligence reviews (${d.marketShare}% share), with ${d.mentions} category picks across ${d.categories.length} categories.${catPhrase}`;
}

// Plain-SVG 12-month sparkline. Renders a flat zero baseline if the partner
// has no recent activity rather than an empty box.
function Sparkline({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0) return null;
  const w = 220;
  const h = 44;
  const padX = 6;
  const padY = 4;
  const max = Math.max(1, ...data.map(p => p.count));
  const stepX = (w - padX * 2) / Math.max(1, data.length - 1);
  const points = data.map((p, i) => {
    const x = padX + i * stepX;
    const y = h - padY - ((p.count / max) * (h - padY * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${(padX + (data.length - 1) * stepX).toFixed(1)},${h - padY} L${padX.toFixed(1)},${h - padY} Z`;
  const total = data.reduce((a, p) => a + p.count, 0);
  const lastSix = data.slice(-6).reduce((a, p) => a + p.count, 0);
  const prevSix = data.slice(-12, -6).reduce((a, p) => a + p.count, 0);
  const trendPct = prevSix > 0
    ? Math.round(((lastSix - prevSix) / prevSix) * 100)
    : (lastSix > 0 ? 100 : 0);
  const trendLabel = prevSix === 0 && lastSix === 0
    ? 'no activity'
    : `${trendPct >= 0 ? '+' : ''}${trendPct}% vs prior 6 mo`;
  const trendColor = trendPct > 0 ? 'text-emerald-700' : trendPct < 0 ? 'text-rose-700' : 'text-gray-500';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">12-month trend</p>
        <span className={`text-[11px] font-medium ${trendColor}`}>{trendLabel}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11" preserveAspectRatio="none" aria-label={`Monthly selections trend, ${total} total`}>
        <path d={areaPath} fill="currentColor" className="text-brand-sky opacity-40" />
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-green" />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{fmtMonth(data[0].month)}</span>
        <span>{fmtMonth(data[data.length - 1].month)}</span>
      </div>
    </div>
  );
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-emerald-100 text-emerald-800';
  if (rank === 2) return 'bg-brand-lime text-brand-green';
  if (rank === 3) return 'bg-brand-yellow text-brand-green';
  return 'bg-gray-100 text-gray-700';
}

export default function StackCollectSection({ partnerName, data: raw, categoryScores = [] }: Props) {
  if (raw.mentions === 0) return null;

  // Normalize: an older API response (without trend/rankings/competitors)
  // is fine — those sections just hide. Avoids hard-failing the build/render
  // if stackcollect.ts on the server is briefly out of sync with the component.
  const data = {
    ...raw,
    uniqueReviewsWithPartner: raw.uniqueReviewsWithPartner ?? 0,
    totalReviewsOnPlatform: raw.totalReviewsOnPlatform ?? raw.totalReviews,
    monthlyMentions: raw.monthlyMentions ?? [],
    categoryRankings: raw.categoryRankings ?? [],
    topCompetitors: raw.topCompetitors ?? [],
  };

  // Adoption (how often operators pick a tool) is what the KPI tiles show;
  // the table below is satisfaction. They answer different questions, so a
  // partner can be the most-picked in a category and sit mid-table on score.
  const scoreByCategory = new Map(categoryScores.map(c => [c.category, c]));
  const anyScores = categoryScores.length > 0;

  // Only categories that clear the five-review bar appear. Below that a
  // single enthusiastic operator moves a rank, and this card names a
  // competitor off the back of it.
  const ratedCategories = (data.categoryRankings ?? [])
    .map(r => ({ category: r.category, cs: scoreByCategory.get(r.category) }))
    .filter((x): x is { category: string; cs: CategoryScore } => Boolean(x.cs?.strict));

  const headline = buildHeadline(partnerName, data, ratedCategories);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
      <h2 className="font-semibold text-gray-900 mb-1">
        Intelligence — Your Marketplace Presence
        <span className="text-gray-400 font-normal ml-2 text-sm">from wearestacked.io</span>
      </h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{headline}</p>

      {/* KPI row — labels now unambiguous about denominators. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">{data.mentions}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">Category picks<br /><span className="text-gray-400">across your categories</span></p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">
            {typeof data.marketplaceOperators === 'number'
              ? data.marketplaceOperators
              : data.uniqueReviewsWithPartner}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">
            {typeof data.marketplaceOperators === 'number' ? (
              <>Operator brands<br /><span className="text-gray-400">as shown on the marketplace</span></>
            ) : (
              <>Operators chose you<br /><span className="text-gray-400">unique reviews</span></>
            )}
          </p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">{data.marketShare}%</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">Share of reviews<br /><span className="text-gray-400">{data.uniqueReviewsWithPartner} of {data.totalReviews} reviews</span></p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">{data.totalReviews}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">Reviews with stack data<br /><span className="text-gray-400">of {data.totalReviewsOnPlatform} total</span></p>
        </div>
      </div>

      {/* Trend sparkline */}
      <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-5">
        <Sparkline data={data.monthlyMentions} />
      </div>

      {/* Category leaderboard — by score. Adoption (how often a tool is
          picked) is public marketplace data and is summarised above; what a
          partner actually asks of this table is "how good do operators think
          we are here, and who's ahead". So rank, benchmark and leader are all
          score-based. The leader is a number, never a name: scores aren't
          public the way pick counts are, and naming the highest-scoring rival
          would publish something no vendor agreed to. */}
      {ratedCategories.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Where you rank, by category</p>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-xs sm:text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Category</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Your score</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Your rank</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Category avg</th>
                  <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Leader</th>
                </tr>
              </thead>
              <tbody>
                {ratedCategories.map(({ category, cs }) => {
                  const view = cs.strict!;
                  const leads = view.rank === 1;
                  return (
                    <tr key={category} className="border-b border-gray-50">
                      <td className="py-2 px-5 sm:px-6 font-medium text-gray-800">{category}</td>
                      <td className="py-2 px-2 text-center tabular-nums">
                        <span className="font-semibold" style={{ color: scoreTone(cs.sos, 'text') }}>
                          {cs.sos.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${rankBadgeClass(view.rank)}`}>
                          {view.rank ? `#${view.rank}` : '—'}
                          <span className="text-gray-500 font-normal ml-1">/ {view.totalRanked}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center text-gray-700 tabular-nums">
                        {cs.categoryAverage.toFixed(1)}
                      </td>
                      <td className="py-2 px-5 sm:px-6 text-gray-700 tabular-nums">
                        {leads
                          ? <span className="text-emerald-700 font-medium">you lead this category</span>
                          : view.leaderName
                            ? <>{view.leaderName}{view.leaderSos !== null && <span className="text-gray-400"> ({view.leaderSos.toFixed(1)})</span>}</>
                            : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 px-5 sm:px-6">
            Rank is among vendors with five or more operator ratings in the category.
          </p>
        </div>
      )}

      {/* Top competitors in shared categories */}
      {data.topCompetitors.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Top competitors in your categories</p>
          <div className="flex flex-wrap gap-2">
            {data.topCompetitors.map(c => (
              <span key={c.tool} className="inline-flex items-center gap-1.5 text-xs bg-rose-50 text-rose-800 px-2.5 py-1 rounded-full">
                <span className="font-medium">{c.tool}</span>
                <span className="text-rose-600 tabular-nums">{c.count}</span>
                {c.sharedCategories > 1 && (
                  <span className="text-rose-400 text-[10px]">in {c.sharedCategories} cats</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category chips — kept for at-a-glance "where do I show up" */}
      {data.categories.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Selected in categories</p>
          <div className="flex flex-wrap gap-2">
            {data.categories.map(c => (
              <span key={c.category} className="text-xs bg-brand-sky text-brand-green px-2.5 py-1 rounded-full">
                {c.category} <span className="opacity-70 tabular-nums">({c.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

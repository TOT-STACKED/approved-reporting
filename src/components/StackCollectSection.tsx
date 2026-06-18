// Per-partner StackCollect block. Shared between the internal /partners/[slug]
// page and the partner-facing /p/[token] page so they stay in sync. The
// numbers all come pre-computed from getPartnerStackCollectData — this file
// is pure presentation.

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
}

interface Props {
  partnerName: string;
  data: PartnerStackData;
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

// Builds the top-of-section sentence. Keeps it readable when categories or
// rankings are sparse — falls back gracefully if leader data isn't available.
function buildHeadline(partnerName: string, d: PartnerStackData): string {
  if (d.uniqueReviewsWithPartner === 0) {
    return `${partnerName} hasn't been selected in any StackCollect reviews yet.`;
  }
  const top = (d.categoryRankings ?? []).slice(0, 2);
  const catPhrase = top.length === 0
    ? ''
    : top.length === 1
      ? ` Strongest in ${top[0].category} (${top[0].partnerCount} picks, ranked #${top[0].rank || '—'} of ${top[0].totalTools}).`
      : ` Strongest in ${top[0].category} (#${top[0].rank || '—'} of ${top[0].totalTools}) and ${top[1].category} (#${top[1].rank || '—'} of ${top[1].totalTools}).`;
  return `${partnerName} was chosen by ${d.uniqueReviewsWithPartner} of ${d.totalReviews} operators (${d.marketShare}% share), with ${d.mentions} category picks across ${d.categories.length} categories.${catPhrase}`;
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

export default function StackCollectSection({ partnerName, data: raw }: Props) {
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

  const headline = buildHeadline(partnerName, data);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
      <h2 className="font-semibold text-gray-900 mb-1">
        StackCollect — Tech Stack Reviews
        <span className="text-gray-400 font-normal ml-2 text-sm">from techontoast.community</span>
      </h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{headline}</p>

      {/* KPI row — labels now unambiguous about denominators. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">{data.mentions}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">Category picks<br /><span className="text-gray-400">across your categories</span></p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">{data.uniqueReviewsWithPartner}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">Operators chose you<br /><span className="text-gray-400">unique reviews</span></p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-brand-green tabular-nums">{data.marketShare}%</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">Share of reviews<br /><span className="text-gray-400">{data.uniqueReviewsWithPartner} of {data.totalReviews}</span></p>
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

      {/* Category leaderboard */}
      {data.categoryRankings.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Where you rank, by category</p>
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-xs sm:text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Category</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Your rank</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Your picks</th>
                  <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Category leader</th>
                </tr>
              </thead>
              <tbody>
                {data.categoryRankings.map(r => {
                  const isLeader = r.rank === 1;
                  return (
                    <tr key={r.category} className="border-b border-gray-50">
                      <td className="py-2 px-5 sm:px-6 font-medium text-gray-800">{r.category}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${rankBadgeClass(r.rank)}`}>
                          {r.rank ? `#${r.rank}` : '—'}<span className="text-gray-500 font-normal ml-1">/ {r.totalTools}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center text-gray-700 tabular-nums">
                        {r.partnerCount}
                        <span className="text-gray-400 text-[10px] ml-1">({Math.round(r.shareInCategory * 100)}%)</span>
                      </td>
                      <td className="py-2 px-5 sm:px-6 text-gray-700">
                        {isLeader
                          ? <span className="text-emerald-700 font-medium">you lead ({r.leader.count})</span>
                          : <span>{r.leader.tool} <span className="text-gray-400 tabular-nums">({r.leader.count})</span></span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

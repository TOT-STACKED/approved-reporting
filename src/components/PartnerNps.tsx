'use client';

export interface PartnerNpsData {
  count: number;
  nps: number | null;
  avg: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  bySource: Record<string, number>;
  recent: Array<{
    id: string;
    created_at: string;
    source: 'techstackreview' | 'toast-support-bot';
    touchpoint: string | null;
    score: number;
    vendor: string | null;
    company: string | null;
    comment: string | null;
  }>;
}

const SOURCE_LABELS: Record<'techstackreview' | 'toast-support-bot', string> = {
  'techstackreview': 'Stack Review',
  'toast-support-bot': 'Support Chat',
};

function npsTone(score: number | null) {
  if (score == null) return 'text-gray-400';
  if (score >= 30)   return 'text-emerald-600';
  if (score >= 0)    return 'text-amber-600';
  return 'text-rose-600';
}

export default function PartnerNps({ data, partnerName }: { data: PartnerNpsData; partnerName: string }) {
  if (data.count === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
        <h2 className="font-semibold text-gray-900 mb-2">NPS</h2>
        <p className="text-sm text-gray-500">
          No NPS responses for {partnerName} yet. Scores from the stack review and support chat
          will appear here as operators rate {partnerName} across either touchpoint.
        </p>
      </div>
    );
  }

  const total = data.count;
  const promoterPct  = Math.round((data.promoters  / total) * 100);
  const passivePct   = Math.round((data.passives   / total) * 100);
  const detractorPct = Math.round((data.detractors / total) * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">NPS</h2>
          <p className="text-xs text-gray-500">How operators rate {partnerName} across every Tech on Toast touchpoint</p>
        </div>
        {Object.keys(data.bySource).length > 0 && (
          <p className="text-xs text-gray-500">
            {Object.entries(data.bySource).map(([src, n], i, arr) => (
              <span key={src}>
                {SOURCE_LABELS[src as 'techstackreview' | 'toast-support-bot'] ?? src} · {n}
                {i < arr.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className={`text-2xl font-bold ${npsTone(data.nps)}`}>{data.nps ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">NPS Score</p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-2xl font-bold text-brand-green">{data.avg ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Avg / 10</p>
        </div>
        <div className="bg-brand-cream rounded-lg p-3 sm:p-4 text-center">
          <p className="text-2xl font-bold text-brand-green">{data.count}</p>
          <p className="text-xs text-gray-500 mt-1">Responses</p>
        </div>
      </div>

      {/* Sentiment split */}
      <div className="mb-5">
        <div className="flex h-3 rounded-full overflow-hidden mb-2">
          <div className="bg-emerald-500" style={{ width: `${(data.promoters  / total) * 100}%` }} />
          <div className="bg-amber-500"   style={{ width: `${(data.passives   / total) * 100}%` }} />
          <div className="bg-rose-500"    style={{ width: `${(data.detractors / total) * 100}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"/><span className="text-gray-600">Promoters</span></div>
            <div className="text-gray-800 font-medium mt-0.5">{data.promoters} <span className="text-gray-400 font-normal">({promoterPct}%)</span></div>
          </div>
          <div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"/><span className="text-gray-600">Passives</span></div>
            <div className="text-gray-800 font-medium mt-0.5">{data.passives} <span className="text-gray-400 font-normal">({passivePct}%)</span></div>
          </div>
          <div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"/><span className="text-gray-600">Detractors</span></div>
            <div className="text-gray-800 font-medium mt-0.5">{data.detractors} <span className="text-gray-400 font-normal">({detractorPct}%)</span></div>
          </div>
        </div>
      </div>

      {/* Recent responses */}
      {data.recent.length > 0 && (
        <div className="overflow-x-auto -mx-5 sm:-mx-6">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Date</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Source</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Vendor</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Company</th>
                <th className="text-center py-2 px-2 text-gray-500 font-medium">Score</th>
                <th className="text-left py-2 px-5 sm:px-6 text-gray-500 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map(r => {
                const tone = r.score >= 9 ? 'bg-emerald-100 text-emerald-700'
                           : r.score >= 7 ? 'bg-amber-100 text-amber-700'
                           : 'bg-rose-100 text-rose-700';
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-5 sm:px-6 text-gray-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                      {SOURCE_LABELS[r.source] ?? r.source}
                    </td>
                    <td className="py-2 px-2 text-gray-800 font-medium whitespace-nowrap">{r.vendor ?? '—'}</td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{r.company ?? '—'}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded font-semibold ${tone}`}>{r.score}</span>
                    </td>
                    <td className="py-2 px-5 sm:px-6 text-gray-600 max-w-xs truncate">{r.comment ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';
type SourceFilter = 'all' | 'techstackreview' | 'toast-support-bot';

interface RecentResponse {
  id: string;
  created_at: string;
  source: 'techstackreview' | 'toast-support-bot';
  touchpoint: string | null;
  score: number;
  vendor: string | null;
  category: string | null;
  company: string | null;
  comment: string | null;
}

interface VendorRollup {
  vendor: string;
  nps: number;
  avg: number;
  count: number;
  promoters: number;
  passives: number;
  detractors: number;
}

interface NpsData {
  total: number;
  overallNps: number | null;
  avg: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  bySource: Record<string, number>;
  vendorRollup: VendorRollup[];
  recent: RecentResponse[];
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  all: 'All',
};

const SOURCE_LABELS: Record<'techstackreview' | 'toast-support-bot', string> = {
  'techstackreview': 'Stack Review',
  'toast-support-bot': 'Support Chat',
};

function getDateCutoff(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case 'week':    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':   return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case 'year':    return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case 'all':     return null;
  }
}

function recomputeStats(recent: RecentResponse[]) {
  const scores = recent.map(r => r.score);
  const promoters  = scores.filter(s => s >= 9).length;
  const passives   = scores.filter(s => s === 7 || s === 8).length;
  const detractors = scores.filter(s => s <= 6).length;
  const avg = scores.length
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
    : null;
  const nps = scores.length
    ? Math.round(((promoters - detractors) / scores.length) * 100)
    : null;
  const byVendor = new Map<string, number[]>();
  for (const r of recent) {
    const v = (r.vendor ?? '').trim();
    if (!v) continue;
    if (!byVendor.has(v)) byVendor.set(v, []);
    byVendor.get(v)!.push(r.score);
  }
  const vendorRollup = Array.from(byVendor.entries())
    .map(([vendor, arr]) => {
      const p = arr.filter(s => s >= 9).length;
      const d = arr.filter(s => s <= 6).length;
      const a = arr.reduce((x, y) => x + y, 0) / arr.length;
      return {
        vendor,
        nps: Math.round(((p - d) / arr.length) * 100),
        avg: Number(a.toFixed(1)),
        count: arr.length,
        promoters: p,
        passives: arr.filter(s => s === 7 || s === 8).length,
        detractors: d,
      };
    })
    .sort((x, y) => y.nps - x.nps);
  return { scores, promoters, passives, detractors, avg, nps, vendorRollup };
}

function npsColor(score: number | null) {
  if (score == null) return 'from-gray-400 to-gray-500';
  if (score >= 30)   return 'from-emerald-500 to-emerald-600';
  if (score >= 0)    return 'from-amber-500 to-amber-600';
  return 'from-rose-500 to-rose-600';
}

export default function NpsDashboard() {
  const [data, setData] = useState<NpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [source, setSource] = useState<SourceFilter>('all');
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    fetch('/api/nps')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filteredRecent = useMemo(() => {
    if (!data) return [];
    const cutoff = getDateCutoff(period);
    return data.recent.filter(r => {
      if (source !== 'all' && r.source !== source) return false;
      if (cutoff && new Date(r.created_at) < cutoff) return false;
      return true;
    });
  }, [data, period, source]);

  const stats = useMemo(() => recomputeStats(filteredRecent), [filteredRecent]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-500">Loading NPS…</p>
      </div>
    );
  }
  if (!data) return null;

  if (data.total === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-bold text-gray-900">NPS</h2>
          <p className="text-xs text-gray-500">Net Promoter Score across every touchpoint</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">
            No NPS responses yet. Once operators rate products in the stack review or vendors in the support chat,
            they&apos;ll show up here.
          </p>
        </div>
      </div>
    );
  }

  const npsScore = stats.nps;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">NPS</h2>
          <p className="text-xs text-gray-500">Net Promoter Score across every touchpoint</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Source filter */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['all', 'techstackreview', 'toast-support-bot'] as SourceFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  source === s ? 'bg-brand-green text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {s === 'all' ? 'All' : SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
          {/* Period filter */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p ? 'bg-brand-green text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className={`bg-gradient-to-br ${npsColor(npsScore)} rounded-2xl p-4 text-white text-center shadow-sm`}>
          <p className="text-2xl sm:text-3xl font-bold">{npsScore ?? '—'}</p>
          <p className="text-xs font-medium opacity-90 mt-1">NPS Score</p>
        </div>
        <div className="bg-brand-lavender rounded-2xl p-4 text-brand-green text-center shadow-sm">
          <p className="text-2xl sm:text-3xl font-bold">{stats.avg ?? '—'}</p>
          <p className="text-xs font-medium opacity-75 mt-1">Avg / 10</p>
        </div>
        <div className="bg-brand-sky rounded-2xl p-4 text-brand-green text-center shadow-sm">
          <p className="text-2xl sm:text-3xl font-bold">{filteredRecent.length}</p>
          <p className="text-xs font-medium opacity-75 mt-1">Responses</p>
        </div>
        <div className="bg-rose-500 rounded-2xl p-4 text-white text-center shadow-sm">
          <p className="text-2xl sm:text-3xl font-bold">{stats.detractors}</p>
          <p className="text-xs font-medium opacity-90 mt-1">Detractors</p>
        </div>
      </div>

      {/* Breakdown + Top Vendors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Promoter / passive / detractor split */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Sentiment Split</h3>
          {filteredRecent.length === 0 ? (
            <p className="text-xs text-gray-400">No data for this period</p>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-3">
                <div className="bg-emerald-500" style={{ width: `${(stats.promoters / filteredRecent.length) * 100}%` }} />
                <div className="bg-amber-500"   style={{ width: `${(stats.passives   / filteredRecent.length) * 100}%` }} />
                <div className="bg-rose-500"    style={{ width: `${(stats.detractors / filteredRecent.length) * 100}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"/><span className="text-gray-600">Promoters</span></div>
                  <div className="text-gray-800 font-medium mt-0.5">{stats.promoters} <span className="text-gray-400 font-normal">({Math.round((stats.promoters / filteredRecent.length) * 100)}%)</span></div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"/><span className="text-gray-600">Passives</span></div>
                  <div className="text-gray-800 font-medium mt-0.5">{stats.passives} <span className="text-gray-400 font-normal">({Math.round((stats.passives / filteredRecent.length) * 100)}%)</span></div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"/><span className="text-gray-600">Detractors</span></div>
                  <div className="text-gray-800 font-medium mt-0.5">{stats.detractors} <span className="text-gray-400 font-normal">({Math.round((stats.detractors / filteredRecent.length) * 100)}%)</span></div>
                </div>
              </div>
              {Object.keys(data.bySource).length > 1 && (
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">Sources: </span>
                  {Object.entries(data.bySource).map(([src, n], i, arr) => (
                    <span key={src}>
                      {SOURCE_LABELS[src as 'techstackreview' | 'toast-support-bot'] ?? src} ({n}){i < arr.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Top vendors by NPS */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Vendors by NPS</h3>
          {stats.vendorRollup.length === 0 ? (
            <p className="text-xs text-gray-400">No vendor-level data yet</p>
          ) : (
            <div className="space-y-2">
              {stats.vendorRollup.slice(0, 8).map(v => (
                <div key={v.vendor} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-700 truncate">{v.vendor}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                        {v.nps} <span className="text-gray-400">· {v.count}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${v.nps >= 30 ? 'bg-emerald-500' : v.nps >= 0 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${Math.max(5, Math.min(100, (v.nps + 100) / 2))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent responses — collapsed by default; the detail isn't needed unless you look */}
      {filteredRecent.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 mt-4">
          <button
            onClick={() => setShowRecent(s => !s)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={showRecent}
          >
            <h3 className="text-sm font-semibold text-gray-700">
              Recent Responses
              <span className="text-xs font-normal text-gray-400 ml-2">({filteredRecent.length})</span>
            </h3>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              {showRecent ? 'Hide' : 'Show latest 10'}
              <svg className={`w-3.5 h-3.5 transition-transform ${showRecent ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
          {showRecent && (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 mt-3">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-4 sm:px-5 text-gray-500 font-medium">Date</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Source</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Vendor</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Company</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Score</th>
                  <th className="text-left py-2 px-4 sm:px-5 text-gray-500 font-medium">Comment</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.slice(0, 10).map(r => {
                  const tone = r.score >= 9 ? 'bg-emerald-100 text-emerald-700'
                             : r.score >= 7 ? 'bg-amber-100 text-amber-700'
                             : 'bg-rose-100 text-rose-700';
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-4 sm:px-5 text-gray-500 whitespace-nowrap">
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
                      <td className="py-2 px-4 sm:px-5 text-gray-600 max-w-xs truncate">{r.comment ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

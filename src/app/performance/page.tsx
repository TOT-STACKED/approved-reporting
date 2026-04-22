'use client';

import { useEffect, useMemo, useState } from 'react';
import { toCsv, downloadCsv } from '@/lib/csv';

interface PartnerPerformance {
  name: string;
  slug: string;
  leadCount: number;
  sqlCount: number;
  mqlCount: number;
  demoCount: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
  leadToSqlPct: number;
  sqlToWonPct: number;
  pipelineGbp: number;
  impressions: number;
  engagements: number;
  activityCount: number;
  lastLeadAt: string | null;
  lastActivityAt: string | null;
  daysSinceLastLead: number | null;
  daysSinceLastActivity: number | null;
}

type SortKey =
  | 'name' | 'leadCount' | 'sqlCount' | 'wonCount'
  | 'leadToSqlPct' | 'sqlToWonPct'
  | 'pipelineGbp' | 'impressions' | 'engagements'
  | 'daysSinceLastLead' | 'daysSinceLastActivity';

const fmtGbp = (n: number) => {
  if (!n) return '£0';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(1)}k`;
  return `£${Math.round(n)}`;
};

function recencyTone(days: number | null): string {
  if (days == null) return 'text-gray-400';
  if (days <= 7)  return 'text-emerald-600';
  if (days <= 30) return 'text-amber-600';
  return 'text-rose-600';
}

function daysLabel(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

export default function PerformancePage() {
  const [rows, setRows] = useState<PartnerPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('sqlCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/performance')
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); })
      .catch(() => setLoading(false));

    // Reuse the hide list the dashboard already maintains.
    try {
      const saved = localStorage.getItem('hiddenPartners');
      if (saved) setHidden(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  const visible = useMemo(
    () => rows.filter(r => !hidden.has(r.name)),
    [rows, hidden]
  );

  const sorted = useMemo(() => {
    const copy = [...visible];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'daysSinceLastLead' || sortKey === 'daysSinceLastActivity') {
        // Null = never, treat as very stale so it sinks to the bottom on desc.
        const av = a[sortKey] ?? Number.MAX_SAFE_INTEGER;
        const bv = b[sortKey] ?? Number.MAX_SAFE_INTEGER;
        cmp = av - bv;
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [visible, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'name' || k === 'daysSinceLastLead' || k === 'daysSinceLastActivity' ? 'asc' : 'desc'); }
  }

  const sortIcon = (k: SortKey) => sortKey !== k ? '↕' : (sortDir === 'asc' ? '↑' : '↓');

  function exportCsv() {
    const headers = [
      'Partner', 'Total leads', 'SQLs', 'MQLs', 'Demos', 'Closed Won', 'Closed Lost',
      'Active', 'Lead → SQL %', 'SQL → Won %',
      'Pipeline £', 'Impressions', 'Engagements', 'Activities',
      'Days since last lead', 'Days since last activity',
    ];
    const body = sorted.map(r => [
      r.name, r.leadCount, r.sqlCount, r.mqlCount, r.demoCount, r.wonCount, r.lostCount,
      r.activeCount, r.leadToSqlPct, r.sqlToWonPct,
      r.pipelineGbp, r.impressions, r.engagements, r.activityCount,
      r.daysSinceLastLead ?? '', r.daysSinceLastActivity ?? '',
    ]);
    downloadCsv(`partner-performance-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500">Loading partner performance…</div>;
  }

  const totalLeads = visible.reduce((s, r) => s + r.leadCount, 0);
  const totalSql   = visible.reduce((s, r) => s + r.sqlCount, 0);
  const totalWon   = visible.reduce((s, r) => s + r.wonCount, 0);
  const totalGbp   = visible.reduce((s, r) => s + r.pipelineGbp, 0);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partner Performance</h1>
          <p className="text-gray-500 mt-1 text-sm">
            SQLs, conversion rates, pipeline and recency across every active partner.
            Hidden partners excluded. MRR and first-response time still need dedicated Airtable fields
            — until they're added we surface marketing pipeline £ and last-lead recency as proxies.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="bg-gray-900 hover:bg-gray-800 text-white text-sm px-4 py-2 rounded-lg font-medium whitespace-nowrap"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{totalLeads.toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">Total leads</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{totalSql.toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">SQLs generated</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{totalWon.toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">Closed Won</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{fmtGbp(totalGbp)}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">Pipeline £ (proxy)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('name')}>Partner {sortIcon('name')}</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('leadCount')}>Leads {sortIcon('leadCount')}</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('sqlCount')}>SQL {sortIcon('sqlCount')}</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('leadToSqlPct')}>
                  Lead→SQL {sortIcon('leadToSqlPct')}
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('wonCount')}>Won {sortIcon('wonCount')}</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('sqlToWonPct')}>
                  SQL→Won {sortIcon('sqlToWonPct')}
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('pipelineGbp')} title="Sum of pipeline value from logged marketing activities — proxy for MRR until a contract-value field exists in Airtable.">
                  Pipeline £ {sortIcon('pipelineGbp')}
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('daysSinceLastLead')} title="Days since the newest lead was modified — proxy for response-time until a first-response timestamp exists in Airtable.">
                  Last Lead {sortIcon('daysSinceLastLead')}
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('daysSinceLastActivity')}>
                  Last Activity {sortIcon('daysSinceLastActivity')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.slug} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    <a href={`/partners/${r.slug}`} className="hover:text-orange-600">{r.name}</a>
                  </td>
                  <td className="py-3 px-3 text-right text-gray-700">{r.leadCount.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-emerald-700 font-semibold">{r.sqlCount.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-gray-600">{r.leadToSqlPct}%</td>
                  <td className="py-3 px-3 text-right text-purple-700 font-semibold">{r.wonCount.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-gray-600">{r.sqlToWonPct}%</td>
                  <td className="py-3 px-3 text-right text-gray-700">{fmtGbp(r.pipelineGbp)}</td>
                  <td className={`py-3 px-3 text-right ${recencyTone(r.daysSinceLastLead)}`}>{daysLabel(r.daysSinceLastLead)}</td>
                  <td className={`py-3 px-3 text-right ${recencyTone(r.daysSinceLastActivity)}`}>{daysLabel(r.daysSinceLastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Tip: a red Last Lead / Last Activity cell means 30+ days since anything happened for that partner.
        Add <code className="bg-gray-100 px-1 rounded">Deal Value</code> and
        <code className="bg-gray-100 px-1 rounded">First Response</code> fields in Airtable to swap the
        proxy columns above for true MRR and response-time metrics.
      </p>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { toCsv, downloadCsv } from '@/lib/csv';
import LeadStatusGlossary from '@/components/LeadStatusGlossary';
import { LEAD_STATUS_EXPLAINER } from '@/lib/lead-status';

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

// Heat-cell background based on value relative to the max in the column.
// Returns an inline style; we use opacity-scaled tints so 0 is neutral and
// the highest value is the strongest tint.
function heatBg(value: number, max: number, hue: 'amber' | 'emerald'): React.CSSProperties {
  if (max <= 0 || value <= 0) return {};
  const intensity = Math.min(1, value / max);
  if (hue === 'amber') {
    // amber-100 → amber-300
    return { backgroundColor: `rgba(251, 191, 36, ${0.1 + intensity * 0.55})` };
  }
  // emerald-100 → emerald-300
  return { backgroundColor: `rgba(16, 185, 129, ${0.1 + intensity * 0.55})` };
}

// Heuristic: which partners need follow-up attention based on MQL/SQL pipeline
// and how stale their last lead activity is.
type Attention = 'high' | 'medium' | 'healthy' | 'quiet';
function attentionLevel(p: { mqlCount: number; sqlCount: number; daysSinceLastLead: number | null }): Attention {
  const pipeline = p.mqlCount + p.sqlCount;
  const days = p.daysSinceLastLead ?? Number.MAX_SAFE_INTEGER;
  if (pipeline === 0) return 'quiet';
  if (days > 30 && pipeline >= 1) return 'high';
  if (days > 14 && pipeline >= 1) return 'medium';
  return 'healthy';
}
const ATTENTION_BADGE: Record<Attention, { dot: string; label: string; chip: string; row: string; emoji: string }> = {
  high:    { dot: 'bg-rose-500',    label: 'Action needed', chip: 'bg-rose-100 text-rose-800 border-rose-300 ring-1 ring-rose-200',      row: 'bg-rose-50/70 hover:bg-rose-50',         emoji: '🚨' },
  medium:  { dot: 'bg-amber-500',   label: 'Follow up',     chip: 'bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-200',  row: 'bg-amber-50/60 hover:bg-amber-50',       emoji: '⚠️' },
  healthy: { dot: 'bg-emerald-500', label: 'Healthy',       chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',                   row: 'hover:bg-gray-50',                       emoji: '✓' },
  quiet:   { dot: 'bg-gray-300',    label: 'Quiet',         chip: 'bg-gray-50 text-gray-500 border-gray-200',                            row: 'hover:bg-gray-50',                       emoji: '·' },
};

function daysLabel(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

interface RawTotals {
  totalLeads: number;
  sqlCount: number;
  mqlCount: number;
  wonCount: number;
}

export default function PerformancePage() {
  const [rows, setRows] = useState<PartnerPerformance[]>([]);
  const [totals, setTotals] = useState<RawTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('sqlCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/performance')
      .then(r => r.json())
      .then(d => {
        setRows(d.rows || []);
        setTotals(d.totals || null);
        setLoading(false);
      })
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
    // Always float poor performers (high → medium → healthy → quiet) above the
    // user's chosen sort, so the table reads top-to-bottom as "needs help first".
    const ATTN_ORDER: Record<Attention, number> = { high: 0, medium: 1, healthy: 2, quiet: 3 };
    copy.sort((a, b) => {
      const attnDiff = ATTN_ORDER[attentionLevel(a)] - ATTN_ORDER[attentionLevel(b)];
      if (attnDiff !== 0) return attnDiff;

      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'daysSinceLastLead' || sortKey === 'daysSinceLastActivity') {
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
      'Partner', 'Attention', 'MAL', 'MQLs', 'SQLs', 'Demos', 'Closed Won', 'Closed Lost',
      'Active', 'Lead → SQL %', 'SQL → Won %',
      'Days since last lead', 'Days since last activity',
    ];
    const body = sorted.map(r => [
      r.name, ATTENTION_BADGE[attentionLevel(r)].label, r.leadCount, r.mqlCount, r.sqlCount, r.demoCount, r.wonCount, r.lostCount,
      r.activeCount, r.leadToSqlPct, r.sqlToWonPct,
      r.daysSinceLastLead ?? '', r.daysSinceLastActivity ?? '',
    ]);
    downloadCsv(`partner-performance-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500">Loading partner performance…</div>;
  }

  // Use raw totals from API (matches main dashboard — every lead counted once,
  // including unassigned). Falls back to summing visible rows if API doesn't
  // include totals (older deploys).
  const totalLeads = totals?.totalLeads ?? visible.reduce((s, r) => s + r.leadCount, 0);
  const totalSql   = totals?.sqlCount   ?? visible.reduce((s, r) => s + r.sqlCount, 0);
  const totalWon   = totals?.wonCount   ?? visible.reduce((s, r) => s + r.wonCount, 0);
  const totalGbp   = visible.reduce((s, r) => s + r.pipelineGbp, 0);

  // Max values for heat-map colour intensity, computed across visible rows.
  const maxMql = Math.max(0, ...visible.map(r => r.mqlCount));
  const maxSql = Math.max(0, ...visible.map(r => r.sqlCount));

  // Attention summary counts for the legend chips
  const attentionCounts = visible.reduce(
    (acc, r) => {
      const lvl = attentionLevel(r);
      acc[lvl]++;
      return acc;
    },
    { high: 0, medium: 0, healthy: 0, quiet: 0 } as Record<Attention, number>
  );

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partner Performance</h1>
          <p className="text-gray-500 mt-1 text-sm">
            MQL/SQL pipeline volume, conversion rates and last-lead recency across every active partner.
            Partners that need attention float to the top — sorted red → amber → green.
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 sm:p-5 text-white" title={LEAD_STATUS_EXPLAINER.MAL}>
          <p className="text-2xl sm:text-3xl font-bold">{totalLeads.toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">MAL</p>
          <p className="text-[10px] opacity-50 mt-0.5">Marketing Awareness Leads</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 sm:p-5 text-white" title={LEAD_STATUS_EXPLAINER.SQL}>
          <p className="text-2xl sm:text-3xl font-bold">{totalSql.toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">SQLs generated</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 sm:p-5 text-white">
          <p className="text-2xl sm:text-3xl font-bold">{totalWon.toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">Closed Won</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 sm:p-5 text-white" title={LEAD_STATUS_EXPLAINER.MQL}>
          <p className="text-2xl sm:text-3xl font-bold">{visible.reduce((s, r) => s + r.mqlCount, 0).toLocaleString()}</p>
          <p className="text-xs sm:text-sm opacity-80 mt-1">MQLs in pipeline</p>
        </div>
      </div>

      <LeadStatusGlossary className="mb-6" />

      {/* Attention legend / heat-map summary */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['high', 'medium', 'healthy', 'quiet'] as Attention[]).map(level => {
          const b = ATTENTION_BADGE[level];
          return (
            <span key={level} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${b.chip}`}>
              <span className={`w-2 h-2 rounded-full ${b.dot}`}></span>
              {b.label}
              <span className="font-bold ml-1">{attentionCounts[level]}</span>
            </span>
          );
        })}
        <span className="text-xs text-gray-400 self-center ml-2">
          Heat colour intensity = pipeline volume relative to top performer
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer select-none"
                    onClick={() => toggleSort('name')}>Partner {sortIcon('name')}</th>
                <th className="text-center py-3 px-3 font-medium text-gray-700">Attention</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    title={LEAD_STATUS_EXPLAINER.MAL}
                    onClick={() => toggleSort('leadCount')}>MAL {sortIcon('leadCount')}</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700" title={LEAD_STATUS_EXPLAINER.MQL}>MQL</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700 cursor-pointer select-none"
                    title={LEAD_STATUS_EXPLAINER.SQL}
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
              {sorted.map(r => {
                const attn = attentionLevel(r);
                const badge = ATTENTION_BADGE[attn];
                const isPoor = attn === 'high' || attn === 'medium';
                return (
                <tr key={r.slug} className={`border-b border-gray-100 transition-colors ${badge.row}`}>
                  <td className="py-3 px-4 font-medium text-gray-900">
                    <span className="flex items-center gap-2">
                      {isPoor && <span className="text-base leading-none" aria-hidden>{badge.emoji}</span>}
                      <a href={`/partners/${r.slug}`} className="hover:text-orange-600">{r.name}</a>
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${badge.chip}`}>
                      <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-gray-500 text-xs">{r.leadCount.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right font-semibold text-amber-800" style={heatBg(r.mqlCount, maxMql, 'amber')}>
                    {r.mqlCount.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-emerald-800" style={heatBg(r.sqlCount, maxSql, 'emerald')}>
                    {r.sqlCount.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-gray-600">{r.leadToSqlPct}%</td>
                  <td className="py-3 px-3 text-right text-purple-700 font-semibold">{r.wonCount.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-gray-600">{r.sqlToWonPct}%</td>
                  <td className={`py-3 px-3 text-right ${recencyTone(r.daysSinceLastLead)}`}>{daysLabel(r.daysSinceLastLead)}</td>
                  <td className={`py-3 px-3 text-right ${recencyTone(r.daysSinceLastActivity)}`}>{daysLabel(r.daysSinceLastActivity)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        🚨 = Action needed (MQL/SQL pipeline with no activity in 30+ days). ⚠️ = Follow up (14–30 days stale).
        MQL and SQL columns are heat-shaded — darker means more leads at that stage relative to the top performer.
      </p>
    </div>
  );
}

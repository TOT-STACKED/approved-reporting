'use client';

import { useMemo, useState } from 'react';
import { toCsv, downloadCsv } from '@/lib/csv';
import { LEAD_STATUS_EXPLAINER } from '@/lib/lead-status';

// Approved partner table — what used to be the separate Performance page,
// now on the dashboard under Partner Health. Uses the same green / amber /
// red bands as the boxes, so the two never disagree.

export interface PartnerTableRow {
  name: string;
  slug: string;
  tier: string;
  band: 'green' | 'amber' | 'red';
  leadCount: number;
  mqlCount: number;
  sqlCount: number;
  wonCount: number;
  lostCount: number;
  leadToSqlPct: number;
  sqlToWonPct: number;
  leads14d: number;
  leads30d: number;
  daysSinceLastLead: number | null;
  daysSinceLastActivity: number | null;
}

type SortKey = 'name' | 'mqlCount' | 'sqlCount' | 'wonCount' | 'leadToSqlPct' | 'sqlToWonPct' | 'leads30d' | 'daysSinceLastLead' | 'daysSinceLastActivity';

const BAND = {
  green: { label: 'Active', dot: 'bg-positive-bright', order: 2 },
  amber: { label: 'Slowing', dot: 'bg-warning', order: 1 },
  red: { label: 'Needs a call', dot: 'bg-negative', order: 0 },
} as const;

function days(d: number | null): string {
  if (d == null) return '—';
  if (d === 0) return 'today';
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${Math.round(d / 365)}y`;
}

export default function PartnerTable({ rows, hiddenSlugs }: { rows: PartnerTableRow[]; hiddenSlugs: string[] }) {
  const [sortKey, setSortKey] = useState<SortKey | 'band'>('band');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const visible = useMemo(() => {
    const hidden = new Set(hiddenSlugs);
    // Approved only: the team doesn't source leads for Promote partners.
    return rows.filter(r => r.tier === 'approved' && !hidden.has(r.slug));
  }, [rows, hiddenSlugs]);

  const sorted = useMemo(() => {
    const copy = [...visible];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'band') {
        cmp = BAND[a.band].order - BAND[b.band].order || b.mqlCount - a.mqlCount;
      } else if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'daysSinceLastLead' || sortKey === 'daysSinceLastActivity') {
        cmp = (a[sortKey] ?? Infinity) - (b[sortKey] ?? Infinity);
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [visible, sortKey, dir]);

  function sortBy(k: SortKey) {
    if (sortKey === k) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setDir(k === 'name' || k === 'daysSinceLastLead' || k === 'daysSinceLastActivity' ? 'asc' : 'desc');
    }
  }
  const arrow = (k: SortKey) => (sortKey !== k ? '' : dir === 'asc' ? ' ↑' : ' ↓');

  function exportCsv() {
    const headers = ['Partner', 'Health', 'Total leads', 'MQL', 'SQL', 'Won', 'Lost', 'Lead → SQL %', 'SQL → Won %', 'New MQLs 14d', 'New MQLs 30d', 'Days since last MQL', 'Days since last activity'];
    const body = sorted.map(r => [
      r.name, BAND[r.band].label, r.leadCount, r.mqlCount, r.sqlCount, r.wonCount, r.lostCount,
      r.leadToSqlPct, r.sqlToWonPct, r.leads14d, r.leads30d, r.daysSinceLastLead ?? '', r.daysSinceLastActivity ?? '',
    ]);
    downloadCsv(`approved-partners-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));
  }

  const th = 'py-2.5 px-3 font-medium text-gray-600 text-right whitespace-nowrap';
  const sortable = (k: SortKey, label: string, title?: string) => (
    <th className={th} title={title} aria-sort={sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sortBy(k)} className="hover:text-gray-900">{label}{arrow(k)}</button>
    </th>
  );

  return (
    <section aria-labelledby="partner-table-heading">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 id="partner-table-heading" className="text-lg font-bold text-brand-green">Approved partners</h2>
          <p className="text-xs text-gray-500 mt-0.5">Every Approved partner&apos;s pipeline. Tap a column to sort; needs-a-call first by default.</p>
        </div>
        <button type="button" onClick={exportCsv} className="text-sm font-medium text-brand-green border border-brand-green/30 hover:bg-brand-green/5 rounded-lg px-3 py-2 min-h-[40px]">
          Export CSV
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="py-2.5 px-3 font-medium text-gray-600 text-left sticky left-0 bg-gray-50" aria-sort={sortKey === 'name' ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => sortBy('name')} className="hover:text-gray-900">Partner{arrow('name')}</button>
              </th>
              <th className="py-2.5 px-3 font-medium text-gray-600 text-left">Health</th>
              {sortable('leads30d', 'Moves 14d / 30d')}
              {sortable('mqlCount', 'MQL', LEAD_STATUS_EXPLAINER.MQL)}
              {sortable('sqlCount', 'SQL', LEAD_STATUS_EXPLAINER.SQL)}
              {sortable('wonCount', 'Won')}
              {sortable('leadToSqlPct', 'Lead→SQL')}
              {sortable('sqlToWonPct', 'SQL→Won')}
              {sortable('daysSinceLastLead', 'Last move')}
              {sortable('daysSinceLastActivity', 'Last activity')}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.slug} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="py-2.5 px-3 font-medium text-gray-900 sticky left-0 bg-white">
                  <a href={`/partners/${r.slug}`} className="hover:underline">{r.name}</a>
                </td>
                <td className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 whitespace-nowrap">
                    <span className={`w-2.5 h-2.5 rounded-full ${BAND[r.band].dot}`} aria-hidden />
                    {BAND[r.band].label}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">{r.leads14d} / {r.leads30d}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{r.mqlCount.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{r.sqlCount.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{r.wonCount.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{r.leadToSqlPct}%</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{r.sqlToWonPct}%</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{days(r.daysSinceLastLead)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{days(r.daysSinceLastActivity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

// Partner health heat map — green / amber / red at a glance so the team can
// spot who's active vs who's a watch-out. Same thresholds as the Performance
// page's attention logic, driven off lead activity + live pipeline.

interface PerfRow {
  name: string;
  slug: string;
  leadCount: number;
  sqlCount: number;
  mqlCount: number;
  daysSinceLastLead: number | null;
}

type Health = 'healthy' | 'watch' | 'urgent' | 'quiet';

function healthOf(r: PerfRow): Health {
  const pipeline = r.mqlCount + r.sqlCount;
  const days = r.daysSinceLastLead ?? Number.MAX_SAFE_INTEGER;
  if (pipeline === 0) return 'quiet';
  if (days > 30) return 'urgent';
  if (days > 14) return 'watch';
  return 'healthy';
}

const STYLE: Record<Health, { tile: string; dot: string; label: string }> = {
  healthy: { tile: 'bg-brand-lime/40 border-brand-green/20', dot: 'bg-brand-green',  label: 'Active' },
  watch:   { tile: 'bg-brand-yellow/50 border-amber-300',    dot: 'bg-amber-500',    label: 'Going stale' },
  urgent:  { tile: 'bg-brand-orange/20 border-brand-orange/40', dot: 'bg-brand-orange', label: 'Watch-out' },
  quiet:   { tile: 'bg-gray-50 border-gray-200',             dot: 'bg-gray-300',     label: 'No pipeline' },
};

// Display order: active first, then stale, then watch-outs, then quiet.
const ORDER: Record<Health, number> = { healthy: 0, watch: 1, urgent: 2, quiet: 3 };

function daysLabel(d: number | null): string {
  if (d == null) return 'no leads yet';
  if (d === 0) return 'today';
  if (d === 1) return '1 day ago';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

interface PartnerHeatMapProps {
  hiddenSlugs?: string[];
  onHide?: (slug: string) => void;
}

export default function PartnerHeatMap({ hiddenSlugs = [], onHide }: PartnerHeatMapProps = {}) {
  const [rows, setRows] = useState<PerfRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/performance')
      .then(r => r.json())
      .then(d => setRows(d.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const hidden = useMemo(() => new Set(hiddenSlugs), [hiddenSlugs]);

  const { sorted, counts } = useMemo(() => {
    const withHealth = (rows || [])
      .filter(r => !hidden.has(r.slug))
      .map(r => ({ ...r, health: healthOf(r) }));
    const sorted = withHealth.sort((a, b) => {
      const o = ORDER[a.health] - ORDER[b.health];
      if (o !== 0) return o;
      return (b.mqlCount + b.sqlCount) - (a.mqlCount + a.sqlCount);
    });
    const counts: Record<Health, number> = { healthy: 0, watch: 0, urgent: 0, quiet: 0 };
    for (const r of withHealth) counts[r.health]++;
    return { sorted, counts };
  }, [rows, hidden]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">Loading partner health…</p>
      </div>
    );
  }
  if (!rows || rows.length === 0) return null;

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-brand-green">Partner Health</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Lead activity at a glance — green is active with live pipeline, red is a watch-out.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['healthy', 'watch', 'urgent', 'quiet'] as Health[]).map(h => (
          <span key={h} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-full ${STYLE[h].dot}`} />
            {STYLE[h].label}
            <span className="font-semibold text-gray-800">{counts[h]}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {sorted.map(r => {
          const s = STYLE[r.health];
          return (
            <div
              key={r.slug || r.name}
              className={`relative rounded-xl border p-3 transition-shadow hover:shadow-sm group ${s.tile}`}
              title={`${r.name} — ${s.label}`}
            >
              {onHide && r.slug && (
                <button
                  onClick={(e) => { e.preventDefault(); onHide(r.slug); }}
                  className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Hide partner"
                  aria-label={`Hide ${r.name}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <a href={`/partners/${r.slug}`} className="block">
                <div className="flex items-start justify-between gap-2 pr-4">
                  <span className="text-sm font-semibold text-gray-900 truncate">{r.name}</span>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${s.dot}`} />
                </div>
                <div className="text-[11px] text-gray-600 mt-1.5">
                  {r.mqlCount} MQL · {r.sqlCount} SQL
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  last lead {daysLabel(r.daysSinceLastLead)}
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

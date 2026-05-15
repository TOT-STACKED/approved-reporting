'use client';

import { LEAD_STATUS_EXPLAINER } from '@/lib/lead-status';

interface LeadStages {
  MAL?: string[];
  MQL?: string[];
  SQL?: string[];
  'Closed Won'?: string[];
  'Closed Lost'?: string[];
}

interface Lead {
  status: string;
  date?: string;
  lastModified?: string;
  stages?: LeadStages;
}

// A lead is "at" a target stage if either its overall status matches OR
// the corresponding stage field has at least one partner attached.
function isLeadAtStage(l: Lead, target: string): boolean {
  const s = (l.status || '').trim();
  if (s === target) return true;
  if (target === 'Closed Won' && s === 'Closed Won ') return true;
  const stagePartners = l.stages?.[target as keyof LeadStages];
  return Array.isArray(stagePartners) && stagePartners.length > 0;
}

function medianDaysToStatus(leads: Lead[], target: string) {
  const matches = leads.filter(l => isLeadAtStage(l, target));
  const gaps: number[] = [];
  for (const l of matches) {
    if (!l.date || !l.lastModified) continue;
    const d1 = Date.parse(l.date);
    const d2 = Date.parse(l.lastModified);
    if (!isNaN(d1) && !isNaN(d2) && d2 >= d1) {
      gaps.push(Math.round((d2 - d1) / 86400000));
    }
  }
  if (gaps.length === 0) return { median: null as number | null, count: 0 };
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 0
    ? Math.round((gaps[mid - 1] + gaps[mid]) / 2)
    : gaps[mid];
  return { median, count: gaps.length };
}

interface ConversionTimelineProps {
  leads: Lead[];
  malCount?: number;
  mqlCount?: number;
  sqlCount?: number;
  closedWonCount?: number;
  className?: string;
  compact?: boolean;
}

export default function ConversionTimeline({
  leads,
  malCount,
  mqlCount,
  sqlCount,
  closedWonCount,
  className = '',
  compact = false,
}: ConversionTimelineProps) {
  // Compute counts from leads if not provided
  const counts = leads.reduce<Record<string, number>>((acc, l) => {
    const k = (l.status || '').trim();
    if (k) acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const mal = malCount ?? (counts['MAL'] || 0);
  const mql = mqlCount ?? (counts['MQL'] || 0);
  const sql = sqlCount ?? (counts['SQL'] || 0);
  const won = closedWonCount ?? ((counts['Closed Won'] || 0) + (counts['Closed Won '] || 0));

  const tMql = medianDaysToStatus(leads, 'MQL');
  const tSql = medianDaysToStatus(leads, 'SQL');
  const tWonA = medianDaysToStatus(leads, 'Closed Won');
  const tWonB = medianDaysToStatus(leads, 'Closed Won ');
  const wonCombined = (() => {
    const totalCount = tWonA.count + tWonB.count;
    if (totalCount === 0) return { median: null as number | null, count: 0 };
    const medians = [tWonA, tWonB].filter(x => x.median !== null);
    const weighted = medians.reduce((s, x) => s + (x.median! * x.count), 0) / totalCount;
    return { median: Math.round(weighted), count: totalCount };
  })();

  const showWarning = !compact && (tMql.count < 3 || tSql.count < 3) && (tMql.count + tSql.count + wonCombined.count) > 0;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Conversion Timeline</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Median days from MAL → each stage</p>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {/* MAL */}
        <div className="flex flex-col items-center min-w-[64px]">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold" title={LEAD_STATUS_EXPLAINER.MAL}>MAL</div>
          <div className="text-[10px] text-gray-400 mt-1.5">Day 0</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{mal} leads</div>
        </div>

        {/* Arrow + MAL→MQL */}
        <div className="flex-1 flex flex-col items-center min-w-[50px]">
          <div className="text-xs sm:text-sm font-semibold text-amber-600 mb-1">{tMql.median !== null ? `${tMql.median}d` : '—'}</div>
          <div className="w-full h-0.5 bg-gradient-to-r from-gray-300 to-amber-400 relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-0.5 w-0 h-0 border-l-[6px] border-l-amber-400 border-y-[4px] border-y-transparent"></div>
          </div>
          <div className="text-[10px] text-gray-400 mt-1.5">n={tMql.count}</div>
        </div>

        {/* MQL */}
        <div className="flex flex-col items-center min-w-[64px]">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold" title={LEAD_STATUS_EXPLAINER.MQL}>MQL</div>
          <div className="text-[10px] text-gray-400 mt-1.5">{tMql.median !== null ? `~${tMql.median}d total` : '—'}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{mql} leads</div>
        </div>

        {/* Arrow + MAL→SQL */}
        <div className="flex-1 flex flex-col items-center min-w-[50px]">
          <div className="text-xs sm:text-sm font-semibold text-emerald-600 mb-1">{tSql.median !== null ? `${tSql.median}d` : '—'}</div>
          <div className="w-full h-0.5 bg-gradient-to-r from-amber-400 to-emerald-500 relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-0.5 w-0 h-0 border-l-[6px] border-l-emerald-500 border-y-[4px] border-y-transparent"></div>
          </div>
          <div className="text-[10px] text-gray-400 mt-1.5">n={tSql.count}</div>
        </div>

        {/* SQL */}
        <div className="flex flex-col items-center min-w-[64px]">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold" title={LEAD_STATUS_EXPLAINER.SQL}>SQL</div>
          <div className="text-[10px] text-gray-400 mt-1.5">{tSql.median !== null ? `~${tSql.median}d total` : '—'}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{sql} leads</div>
        </div>

        {/* Arrow + MAL→Won */}
        <div className="flex-1 flex flex-col items-center min-w-[50px]">
          <div className="text-xs sm:text-sm font-semibold text-purple-600 mb-1">{wonCombined.median !== null ? `${wonCombined.median}d` : '—'}</div>
          <div className="w-full h-0.5 bg-gradient-to-r from-emerald-500 to-purple-600 relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-0.5 w-0 h-0 border-l-[6px] border-l-purple-600 border-y-[4px] border-y-transparent"></div>
          </div>
          <div className="text-[10px] text-gray-400 mt-1.5">n={wonCombined.count}</div>
        </div>

        {/* Closed Won */}
        <div className="flex flex-col items-center min-w-[64px]">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold leading-tight text-center">Won</div>
          <div className="text-[10px] text-gray-400 mt-1.5">{wonCombined.median !== null ? `~${wonCombined.median}d total` : '—'}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{won} leads</div>
        </div>
      </div>
      {showWarning && (
        <p className="text-[10px] text-gray-400 mt-3 italic">⚠ Small sample — median based on lead creation date and last status change. Add explicit MQL/SQL/Won date fields for precision.</p>
      )}
    </div>
  );
}

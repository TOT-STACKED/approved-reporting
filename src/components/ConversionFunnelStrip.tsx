// A small one-line summary of how leads move through the pipeline.
// Cumulative-conversion math: each rate is "% of leads that reached the
// previous stage and made it to the next one" so the funnel reads
// monotonically left to right.

interface Props {
  leadCount: number;
  statusBreakdown: Record<string, number>;
}

function rateOf(top: number, bottom: number): number {
  if (bottom <= 0) return 0;
  return (top / bottom) * 100;
}

function fmtPct(n: number): string {
  if (n === 0) return '0%';
  if (n < 10) return `${n.toFixed(1)}%`;
  return `${Math.round(n)}%`;
}

export default function ConversionFunnelStrip({ leadCount, statusBreakdown }: Props) {
  if (leadCount === 0) return null;

  const mql = statusBreakdown['MQL'] || 0;
  const sql = statusBreakdown['SQL'] || 0;
  const won = statusBreakdown['Closed Won'] || 0;
  const lost = statusBreakdown['Closed Lost'] || 0;

  // "Reached MQL" = currently at MQL or beyond it (incl. losses, since those
  // leads were once MQL+). Same for "reached SQL".
  const reachedMql = mql + sql + won + lost;
  const reachedSql = sql + won + lost;

  const malToMql = rateOf(reachedMql, leadCount);
  const mqlToSql = rateOf(reachedSql, reachedMql);
  const sqlToWon = rateOf(won, reachedSql);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
        Pipeline conversion
      </p>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-2 sm:gap-x-5 sm:gap-y-2 text-sm">
        <Step label="MAL → MQL" value={malToMql} note={`${reachedMql} of ${leadCount}`} />
        <Arrow />
        <Step label="MQL → SQL" value={mqlToSql} note={`${reachedSql} of ${reachedMql}`} />
        <Arrow />
        <Step label="SQL → Won" value={sqlToWon} note={`${won} of ${reachedSql}`} />
      </div>
    </div>
  );
}

function Step({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-bold text-brand-green tabular-nums">{fmtPct(value)}</span>
      <span className="text-[11px] text-gray-400">({note})</span>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-300 select-none hidden sm:inline">→</span>;
}

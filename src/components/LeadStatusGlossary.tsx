import { LEAD_STATUS_EXPLAINER, type LeadStatusCode } from '@/lib/lead-status';

const PILL_CLASS: Record<LeadStatusCode, string> = {
  MAL: 'bg-green-100 text-green-700',
  MQL: 'bg-yellow-100 text-yellow-700',
  SQL: 'bg-orange-100 text-orange-700',
};

/**
 * `showMal` is false on the partner-facing dashboard only. MAL leads are
 * Stacked's own prospecting and never reach a partner, so defining the term
 * there drew attention to a stage they cannot see. The internal pages keep
 * it — the team works in MAL every day.
 */
export default function LeadStatusGlossary({
  className = '',
  showMal = true,
}: {
  className?: string;
  showMal?: boolean;
}) {
  const codes: LeadStatusCode[] = showMal ? ['MAL', 'MQL', 'SQL'] : ['MQL', 'SQL'];
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <div className={`grid grid-cols-1 gap-3 ${showMal ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {codes.map(code => (
          <div key={code} className="flex items-start gap-2">
            <span className={`inline-block text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap ${PILL_CLASS[code]}`}>
              {code}
            </span>
            <p className="text-xs text-gray-600 leading-relaxed">{LEAD_STATUS_EXPLAINER[code]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

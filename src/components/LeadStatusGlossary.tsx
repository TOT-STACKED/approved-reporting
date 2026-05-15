import { LEAD_STATUS_EXPLAINER, type LeadStatusCode } from '@/lib/lead-status';

const PILL_CLASS: Record<LeadStatusCode, string> = {
  MAL: 'bg-green-100 text-green-700',
  MQL: 'bg-yellow-100 text-yellow-700',
  SQL: 'bg-orange-100 text-orange-700',
};

export default function LeadStatusGlossary({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['MAL', 'MQL', 'SQL'] as const).map(code => (
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

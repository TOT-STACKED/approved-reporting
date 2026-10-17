import Link from 'next/link';
import { FIELD_VENUE_TYPES, fmtWhen, labelFor, stackCount, type FieldVisit } from '@/lib/field-shared';

export default function VisitList({ visits, showAgent = false }: { visits: FieldVisit[]; showAgent?: boolean }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
      {visits.map(v => {
        const tech = stackCount(v.stack);
        return (
          <li key={v.id}>
            <Link href={`/field/visits/${v.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold">{v.venue_name}</p>
                <p className="truncate text-[13px] text-muted">
                  {fmtWhen(v.visited_at)}
                  {showAgent && v.agent_name ? ` · ${v.agent_name}` : ''}
                  {v.venue_type ? ` · ${labelFor(FIELD_VENUE_TYPES, v.venue_type)}` : ''}
                  {v.postcode ? ` · ${v.postcode}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                {v.demo_interest === 'yes' && <span className="rounded-full bg-positive-tint px-2 py-0.5 font-bold text-positive">Lead</span>}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono">{tech} tech</span>
                {v.photos.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono">{v.photos.length} 📷</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

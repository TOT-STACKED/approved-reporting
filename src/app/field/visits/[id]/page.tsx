import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FieldHeader, FieldTabs } from '@/components/field/FieldChrome';
import VisitMapCard from '@/components/field/VisitMapCard';
import DeleteVisit from '@/components/field/DeleteVisit';
import { canAccess, currentAgent, getVisit, photoLinks } from '@/lib/field-db';
import {
  BUSYNESS, DEMO_INTEREST, FIELD_CATEGORIES, FIELD_VENUE_TYPES, OWNERSHIP, distanceM, fmtWhen, labelFor, stackLabel,
  type FieldStackEntry,
} from '@/lib/field-shared';

export const dynamic = 'force-dynamic';

function entryText(e: FieldStackEntry): string {
  if (e.none) return 'None seen';
  return [...(e.tools || []), e.other].filter(Boolean).join(', ');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-28 shrink-0 text-[14px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[15px] break-words">{value}</dd>
    </div>
  );
}

export default async function VisitPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const agent = await currentAgent();
  if (!agent) redirect('/field/signin');
  const { id } = await params;
  const { saved } = await searchParams;
  const visit = await getVisit(id);
  if (!visit || !canAccess(agent, visit)) notFound();
  const photos = await photoLinks(visit.photos);

  // Field categories first in their usual order, then anything from a review.
  const keys = [
    ...FIELD_CATEGORIES.map(c => c.id).filter(k => visit.stack[k]),
    ...Object.keys(visit.stack).filter(k => !FIELD_CATEGORIES.some(c => c.id === k)),
  ];
  const hasContact = visit.contact_name || visit.contact_email || visit.contact_phone || visit.demo_interest;
  const back = agent.role === 'manager' && visit.agent_id !== agent.id ? '/field/manage' : '/field';

  return (
    <>
      <FieldHeader title={visit.venue_name} back={back} />
      <main className="mx-auto w-full max-w-md md:max-w-2xl pb-4">
        {saved && <p className="mx-4 mt-3 rounded-xl bg-positive-tint px-4 py-3 text-[15px] font-bold text-positive">Saved.</p>}

        <VisitMapCard visit={visit} />

        <div className="px-4">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full bg-ink px-3 py-1 font-bold text-white">{visit.agent_name || 'Unknown agent'}</span>
            <span className="rounded-full bg-surface px-3 py-1">{fmtWhen(visit.visited_at)}</span>
            {visit.source === 'intelligence' && <span className="rounded-full bg-tag-advisory px-3 py-1 font-bold">Intelligence</span>}
            {visit.source === 'field' && visit.submission_id && <span className="rounded-full bg-tag-advisory px-3 py-1 font-bold">Review done ✓</span>}
            {visit.geo_precision !== 'exact' && <span className="rounded-full bg-warning-tint px-3 py-1 text-warning-dark">{visit.geo_precision === 'none' ? 'No location yet' : 'Approx. location'}</span>}
            {visit.demo_interest === 'yes' && <span className="rounded-full bg-positive-tint px-3 py-1 font-bold text-positive">Wants a demo</span>}
          </div>

          <section className="mb-4 rounded-2xl bg-surface px-4 py-2">
            <dl className="divide-y divide-border">
              <Row label="Address" value={[visit.address, visit.postcode].filter(Boolean).join(' · ')} />
              <Row label="Type" value={labelFor(FIELD_VENUE_TYPES, visit.venue_type)} />
              <Row label="Covers" value={visit.covers} />
              <Row label="Ownership" value={[labelFor(OWNERSHIP, visit.ownership), visit.group_name].filter(Boolean).join(' · ')} />
              <Row label="Busyness" value={labelFor(BUSYNESS, visit.busyness)} />
              <Row label="Phone GPS" value={visit.gps_accuracy_m != null
                ? `±${visit.gps_accuracy_m} m${visit.lat != null && visit.lng != null && visit.gps_lat != null && visit.gps_lng != null
                  ? `, ${distanceM(visit.lat, visit.lng, visit.gps_lat, visit.gps_lng)} m from the pin` : ''}${visit.gps_accuracy_m >= 800 ? ' (Precise Location was off)' : ''}`
                : null} />
            </dl>
          </section>

          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Tech</h2>
          <section className="mb-4 rounded-2xl bg-surface px-4 py-2">
            {keys.length ? (
              <dl className="divide-y divide-border">
                {keys.map(k => <Row key={k} label={stackLabel(k)} value={entryText(visit.stack[k])} />)}
              </dl>
            ) : <p className="py-3 text-[15px] text-muted">Nothing recorded.</p>}
          </section>

          {photos.length > 0 && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Photos</h2>
              <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                {photos.map(u => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </>
          )}

          {visit.notes && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Notes</h2>
              <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-surface p-4 text-[15px]">{visit.notes}</p>
            </>
          )}

          {hasContact && (
            <>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Contact · internal only</h2>
              <section className="mb-4 rounded-2xl bg-surface px-4 py-2">
                <dl className="divide-y divide-border">
                  <Row label="Name" value={[visit.contact_name, visit.contact_role].filter(Boolean).join(', ')} />
                  <Row label="Email" value={visit.contact_email && <a className="underline" href={`mailto:${visit.contact_email}`}>{visit.contact_email}</a>} />
                  <Row label="Phone" value={visit.contact_phone && <a className="underline" href={`tel:${visit.contact_phone}`}>{visit.contact_phone}</a>} />
                  <Row label="Demo?" value={labelFor(DEMO_INTEREST, visit.demo_interest)} />
                </dl>
              </section>
            </>
          )}

          <div className="flex gap-2">
            <Link href={`/field/visits/${visit.id}/edit`} className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-ink text-[16px] font-bold text-white active:bg-ink-deep">
              Edit
            </Link>
            <DeleteVisit id={visit.id} back={back} />
          </div>
        </div>
      </main>
      <FieldTabs manager={agent.role === 'manager'} />
    </>
  );
}

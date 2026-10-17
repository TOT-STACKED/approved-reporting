'use client';

import FieldMap from './FieldMap';
import type { FieldVisit } from '@/lib/field-shared';

/** The visit's pin, plus where the phone was when it was saved. */
export default function VisitMapCard({ visit }: { visit: FieldVisit }) {
  if (visit.lat == null || visit.lng == null) {
    return (
      <p className="mx-4 mt-4 mb-4 rounded-2xl bg-warning-tint px-4 py-3 text-[14px] text-warning-dark">
        No location yet. Tap <b>Edit</b> and drop the pin where the venue is.
      </p>
    );
  }
  const at = { lat: visit.lat, lng: visit.lng };
  const pins = [{ id: visit.id, ...at, label: visit.venue_name, tone: 'selected' as const }];
  const me = visit.gps_lat != null && visit.gps_lng != null
    ? { lat: visit.gps_lat, lng: visit.gps_lng, accuracy: visit.gps_accuracy_m ?? undefined }
    : null;
  return (
    <div className="mb-4 sm:mx-4 sm:mt-4 sm:overflow-hidden sm:rounded-2xl">
      <FieldMap className="h-52 w-full md:h-72" pins={pins} me={me} center={at} zoom={visit.geo_precision === 'town' ? 12 : 17} />
    </div>
  );
}

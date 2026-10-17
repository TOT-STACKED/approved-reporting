'use client';

import FieldMap from './FieldMap';
import type { FieldVisit } from '@/lib/field-shared';

/** The visit's pin, plus where the phone was when it was saved. */
export default function VisitMapCard({ visit }: { visit: FieldVisit }) {
  const pins = [{ id: visit.id, lat: visit.lat, lng: visit.lng, label: visit.venue_name, tone: 'selected' as const }];
  const me = visit.gps_lat != null && visit.gps_lng != null
    ? { lat: visit.gps_lat, lng: visit.gps_lng, accuracy: visit.gps_accuracy_m ?? undefined }
    : null;
  return (
    <div className="mb-4 sm:mx-4 sm:mt-4 sm:overflow-hidden sm:rounded-2xl">
      <FieldMap className="h-52 w-full" pins={pins} me={me} center={visit} zoom={visit.geo_precision === 'town' ? 12 : 17} />
    </div>
  );
}

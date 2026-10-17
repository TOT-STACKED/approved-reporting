'use client';

import GoogleMap from './GoogleMap';
import LeafletMap from './LeafletMap';
import type { MapProps } from './map-types';

export type { MapPin, MapTrail, MapProps } from './map-types';

// Every Field map goes through here. Google Maps when
// NEXT_PUBLIC_GOOGLE_MAPS_KEY is set at build time, otherwise the free
// OpenStreetMap fallback, so the app works before the key exists.
const USE_GOOGLE = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY);

export default function FieldMap(props: MapProps) {
  return USE_GOOGLE ? <GoogleMap {...props} /> : <LeafletMap {...props} />;
}

// Shared props for both map backends (Google Maps and Leaflet/OpenStreetMap),
// so every Field screen talks to one interface. See FieldMap.tsx.

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** 'selected' is the venue being tagged; 'visited' a past visit; 'place' a nearby venue. */
  tone?: 'selected' | 'visited' | 'place';
  /** Fill colour override, e.g. one colour per agent on the team map. */
  color?: string;
  /** Draw as a ring in `color` instead of a filled dot (e.g. imported history). */
  hollow?: boolean;
}

/** Resolve a pin's fill, stroke, size and weight. */
export function pinLook(p: MapPin) {
  const s = PIN_STYLE[p.tone || 'place'];
  if (p.hollow && p.color) return { fill: '#FFFFFF', stroke: p.color, radius: s.radius - 1, weight: 3 };
  return { fill: p.color || s.fill, stroke: s.stroke, radius: s.radius, weight: s.weight };
}

/** A line joining one agent's visits in time order — their route for a day. */
export interface MapTrail {
  id: string;
  color: string;
  points: { lat: number; lng: number }[];
}

export interface MapProps {
  pins: MapPin[];
  trails?: MapTrail[];
  /** The agent's phone, drawn as a blue dot with its accuracy ring. */
  me?: { lat: number; lng: number; accuracy?: number } | null;
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  /** Fit the view to every pin whenever the set of pins changes. */
  fit?: boolean;
  onPinClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

export const PIN_STYLE = {
  selected: { stroke: '#FFFFFF', fill: '#FF5014', radius: 11, weight: 3 },
  visited: { stroke: '#FFFFFF', fill: '#38278F', radius: 8, weight: 2 },
  place: { stroke: '#38278F', fill: '#FFFFFF', radius: 8, weight: 2 },
} as const;

export const ME_COLOR = '#4E71F2';

/** Invisible tap target around every pin: 44 px across, a fingertip, so pins are easy to hit on a phone. */
export const TAP_RADIUS = 22;
export const LONDON = { lat: 51.5074, lng: -0.1278 };

/** A stable key for "the set of pins changed", used to decide when to refit. */
export function pinsKey(pins: MapPin[]): string {
  return pins.map(p => p.id).sort().join(',');
}

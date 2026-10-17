// Stacked Field — agents walk into venues, tag them on a map and record what
// they can see. Safe to import from client components: types, labels and the
// tech catalogue only. Data access lives in field-db.ts.
//
// Stack keys reuse the Intelligence Review ids where the category exists
// there (pos, payments, loyalty, guest_feedback), so a field visit and a
// submission can be merged category by category later.

import { REVIEW_CATEGORIES } from './intelligence-review';

const reviewOptions = (id: string) => REVIEW_CATEGORIES.find(c => c.id === id)?.options || [];

export interface FieldCategory {
  id: string;
  label: string;
  /** What to look for, shown under the label. */
  hint: string;
  options: string[];
}

/** Things an agent can see from the floor, in the order they'd spot them. */
export const FIELD_CATEGORIES: FieldCategory[] = [
  { id: 'pos', label: 'POS / till', hint: 'Brand on the till screen or receipt', options: reviewOptions('pos') },
  { id: 'payments', label: 'Card terminals', hint: 'Brand on the card machine', options: reviewOptions('payments') },
  { id: 'ordering', label: 'Order & pay at table', hint: 'QR codes on tables, menus', options: ['sunday', 'Stampede', 'Flipdish', 'Butlr', 'Yoello', 'Mr Yum / me&u', 'Pepper', 'Vita Mojo', 'Tabology', 'Wi-Q', 'Ordamo', 'Toast'] },
  { id: 'kiosk', label: 'Self-order kiosks', hint: 'Touchscreens customers order on', options: ['Vita Mojo', 'GRUBBRR', 'Flipdish', 'Kiosk by Lightspeed', 'Zonal', 'Tillpoint', 'Wavetec'] },
  { id: 'kds', label: 'Kitchen screens', hint: 'Screens on the pass instead of tickets', options: ['Fresh KDS', 'Toast KDS', 'Lightspeed KDS', 'Zonal KDS', 'Nory', 'Apicbase', 'QSR Automations'] },
  { id: 'handhelds', label: 'Handheld ordering', hint: 'Staff taking orders on phones or tablets', options: ['Toast Go', 'Lightspeed', 'Zonal', 'Tevalis', 'SumUp', 'Square', 'Tebi'] },
  { id: 'reservations', label: 'Bookings & waitlist', hint: 'Booking widget, waitlist screen, tablet at the door', options: ['OpenTable', 'ResDiary', 'SevenRooms', 'Collins', 'DesignMyNight', 'Tablein', 'Quandoo', 'Resy', 'Tock', 'Waitly'] },
  { id: 'loyalty', label: 'Loyalty & CRM', hint: 'Stamp cards, app prompts, sign-up QR', options: reviewOptions('loyalty') },
  { id: 'guest_wifi', label: 'Guest Wi-Fi', hint: 'Wi-Fi sign-in page or sticker', options: ['Stampede', 'Purple', 'Beambox', 'Zonal Wi-Fi', 'BT Wi-Fi', 'Sky Wi-Fi', 'Virgin Media'] },
  { id: 'guest_feedback', label: 'Guest feedback', hint: 'Feedback QR, review prompts', options: reviewOptions('guest_feedback') },
  { id: 'signage', label: 'Digital menus & signage', hint: 'Screens showing menus or promos', options: ['ScreenCloud', 'Yodeck', 'Rise Vision', 'Signagelive', 'NowSignage'] },
];

/**
 * Label for any stack key. Visits imported from Intelligence Reviews carry the
 * review's back-office categories (workforce, inventory…) as well as the ones
 * an agent can see, so fall back to the review's labels.
 */
export function stackLabel(key: string): string {
  return FIELD_CATEGORIES.find(c => c.id === key)?.label
    || REVIEW_CATEGORIES.find(c => c.id === key)?.label
    || key;
}

export function isFieldCategory(v: unknown): boolean {
  return typeof v === 'string' && FIELD_CATEGORIES.some(c => c.id === v);
}

/** Any category a visit's stack may hold: the field ones plus the review's. */
export function isStackKey(v: unknown): boolean {
  return isFieldCategory(v) || (typeof v === 'string' && REVIEW_CATEGORIES.some(c => c.id === v));
}

export const FIELD_VENUE_TYPES = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'pub', label: 'Pub' },
  { id: 'bar', label: 'Bar' },
  { id: 'cafe', label: 'Café / coffee' },
  { id: 'qsr', label: 'QSR / fast casual' },
  { id: 'hotel', label: 'Hotel F&B' },
  { id: 'nightclub', label: 'Late night' },
  { id: 'other', label: 'Other' },
] as const;

export const COVER_BANDS = ['<30', '30-60', '60-120', '120-250', '250+'] as const;

export const OWNERSHIP = [
  { id: 'independent', label: 'Independent' },
  { id: 'group', label: 'Group' },
  { id: 'franchise', label: 'Franchise' },
  { id: 'unknown', label: 'Not sure' },
] as const;

export const BUSYNESS = [
  { id: 'quiet', label: 'Quiet' },
  { id: 'steady', label: 'Steady' },
  { id: 'busy', label: 'Busy' },
  { id: 'packed', label: 'Packed' },
] as const;

export const DEMO_INTEREST = [
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
] as const;

export interface FieldStackEntry {
  tools: string[];
  other: string;
  none: boolean;
}

export type FieldStack = Record<string, FieldStackEntry>;

export interface FieldVisit {
  id: string;
  visited_at: string;
  agent_id: string;
  agent_name?: string | null;
  source: 'field' | 'intelligence';
  submission_id: string | null;
  venue_name: string;
  address: string | null;
  postcode: string | null;
  osm_ref: string | null;
  /** Null for imported reviews whose location couldn't be found ("No location yet"). */
  lat: number | null;
  lng: number | null;
  geo_precision: 'exact' | 'postcode' | 'town' | 'none';
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  venue_type: string | null;
  covers: string | null;
  ownership: string | null;
  group_name: string | null;
  busyness: string | null;
  stack: FieldStack;
  notes: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  demo_interest: string | null;
  photos: string[];
}

/** A place near the agent, from OpenStreetMap. */
export interface NearbyPlace {
  ref: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  address: string;
  postcode: string;
  distance_m: number;
}

export interface FieldAgent {
  id: string;
  email: string;
  name: string | null;
  role: 'agent' | 'manager';
  active: boolean;
  last_sign_in_at?: string | null;
}

/** How many categories have something recorded. */
export function stackCount(stack: FieldStack | null | undefined): number {
  return Object.values(stack || {}).filter(e => e && !e.none && (e.tools?.length || e.other?.trim())).length;
}

export function labelFor(list: readonly { id: string; label: string }[], id: string | null | undefined): string {
  return list.find(x => x.id === id)?.label || id || '';
}

/** Metres between two points. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const TZ = 'Europe/London';

/** The UK calendar day of a time, as YYYY-MM-DD. Servers run on UTC, agents don't. */
export function ukDay(d: Date | string | number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}

/** "Today 14:05", "Yesterday 09:30" or "3 Oct 11:15", in UK time. */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const day = ukDay(d);
  if (day === ukDay(Date.now())) return `Today ${time}`;
  if (day === ukDay(Date.now() - 86400000)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })} ${time}`;
}

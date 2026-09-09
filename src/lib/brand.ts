// Stacked brand palette for anything that can't go through a CSS class —
// Recharts props, inline SVG, and the HTML we generate server-side for the
// report and the digest email. Same values as the tokens in globals.css; this
// is the single source for the JS side so the two can't drift.
//
// Rules that come with these values, from the Stacked partner dashboard spec:
//   · orange is for calls to action only, never a chart fill
//   · flat fills, no gradients, no shadows, no 3D
//   · colour never carries meaning on its own — the number is always beside it

export const INK = '#38278F';
export const INK_DEEP = '#2A1D6B';
export const MUTED = '#5A564F';
export const DIM = '#827D74';
export const BORDER = '#E6E1D2';
export const SURFACE = '#FFFFFF';
export const SURFACE_2 = '#F2EFE6';
export const BG = '#F1F0E9';

export const PRIMARY = '#FF5014';
export const PRIMARY_PRESS = '#C34014';
export const PRIMARY_TINT = '#FFD1BE';
export const PRIMARY_WASH = '#FFF3EC';

export const POSITIVE = '#167034';
export const POSITIVE_BRIGHT = '#3BD36F';
export const POSITIVE_TINT = '#C7F3D5';
export const WARNING = '#F5A524';
export const WARNING_DARK = '#8B5A0F';
export const WARNING_TINT = '#FBE3B0';
export const NEGATIVE = '#E5484D';
export const NEGATIVE_DARK = '#7A1E21';
export const NEGATIVE_TINT = '#F5C6C8';

/** Chart series, in order. Take them from the front, don't cherry-pick. */
export const SERIES = [
  '#38278F', // dark purple
  '#FF90C0', // pink
  '#90D8F0', // sky
  '#B0F070', // lime
  '#D8C0F0', // lavender
  '#FFC090', // peach
  '#FFF0C0', // butter
] as const;

/** Gridlines are a hairline in the border tone; axis text is muted ink. */
export const GRID = BORDER;
export const AXIS = MUTED;

/** Pipeline stages read as a progression from palest to darkest, with the two
 *  outcomes on the semantic colours. Fixed mapping — the same status must be
 *  the same colour on every chart in the dashboard. */
export const LEAD_STATUS_COLORS: Record<string, string> = {
  MAL: '#D8C0F0',
  MQL: '#90D8F0',
  SQL: '#B0F070',
  Demo: '#FFC090',
  'Closed Won': POSITIVE,
  'Closed Lost': NEGATIVE,
};

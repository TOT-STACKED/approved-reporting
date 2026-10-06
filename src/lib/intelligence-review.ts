// The Intelligence Review, as asked inside Stacked Renewals. A venue that signs
// up for Renewals without a review fills this in first. It writes the same
// `submissions` row the standalone form does, so the Slack ping, the AI-written
// report email, the partner portal sync and the marketplace all treat it as a
// normal review.
//
// The catalogue, benchmarks and scoring are ported from
// github.com/TOT-STACKED/techstackreview (index.html: CATEGORIES, FINANCE_OPS,
// GUEST_FEEDBACK, BENCHMARKS, ROI, buildReport). If the form's tool lists or
// scoring change there, change them here too, or Renewals reviews will score
// differently from form reviews.
//
// Safe to import from client components.

export interface ReviewCategory {
  id: string;
  /** Canonical label. Lands verbatim in gap_categories and the portal taxonomy. */
  label: string;
  hint: string;
  options: string[];
  /** Scored categories drive score, coverage and £ upside. Finance and guest feedback are captured only. */
  scored: boolean;
}

export const REVIEW_CATEGORIES: ReviewCategory[] = [
  { id: 'pos', label: 'Point of Sale', hint: 'The till system that runs service', scored: true,
    options: ['Toast', 'Lightspeed', 'Zonal', 'Tissl', 'Tevalis', 'WRS', 'Kobas', 'Tebi', 'Square', 'SumUp POS', 'SkyTab', 'Tabology', 'Pointone', 'Redcat', 'Shopwave', 'Vita Mojo'] },
  { id: 'payments', label: 'Payments', hint: 'Card terminals, tips, gift cards', scored: true,
    options: ['Dojo', 'DNA Payments', 'Lightspeed Payments', 'Toast Payments', 'Lloyds', 'sunday', 'Atoa', 'SumUp', 'Square', 'Tebi', 'TipJar', 'URocked', 'JustTip', 'StrikeTip', 'Grateful', 'GiftTrees'] },
  { id: 'workforce', label: 'People Management', hint: 'Rotas, payroll, HR, flex staffing', scored: true,
    options: ['Bizimply', 'Connect Frontline', 'Deputy', 'Planday', 'Fourth', 'Harri', 'Rotaready', 's4labour', 'Sona', 'Brigad', 'Workfeed', 'Workforce', 'PayCaptain', 'All Gravy', 'Limber', 'CrunchTime', 'Nory'] },
  { id: 'inventory', label: 'Inventory & Stock Management', hint: 'Stock, recipe, purchasing, GP tracking', scored: true,
    options: ['Apicbase', 'MarketMan', 'Nory', 'Fourth', 'Growyze', 'Stocktake Online', 'Purchase Warrior (triSaaS)', 'Supy', 'Inpulse', 'Cinchio', 'Peckish'] },
  { id: 'loyalty', label: 'Loyalty & CRM', hint: 'Guest data, repeat visits, marketing', scored: true,
    options: ['Airship', 'Como', 'Klaviyo', 'Bloomreach', 'Pepper', 'Acteol', 'Embargo', 'Stampede', 'Paytronix', 'Impact Data', 'Cardlytics', 'Fydelia', 'Krowd'] },
  { id: 'learning', label: 'Learning & Development', hint: 'Training, L&D, team comms', scored: true,
    options: ['Tayl', 'CPL Learning', '5Mins AI', 'Blink', 'Zenzap', 'Sideways', 'Monotree', 'Mapal', 'All Gravy'] },
  { id: 'finance_ops', label: 'Finance & Accounting', hint: 'Accounting, P&L, back-office reporting', scored: false,
    options: ['Sage', 'Xero', 'QuickBooks', 'Tenzo', 'Tahola', 'Nory', 'Accurise', 'FreeAgent', 'Lightyear', 'Independent accountant'] },
  { id: 'guest_feedback', label: 'Guest Feedback', hint: 'Guest comms, reviews, sentiment and feedback', scored: false,
    options: ['Salt AI', 'Sadie', 'Revvue', 'Feedelity', 'Sentiment Search', 'HGEM', 'Yumpingo', '125 Data'] },
];

export const VENUE_TYPES = [
  { id: 'indie', label: 'Independent restaurant' },
  { id: 'group', label: 'Multi-site restaurant group' },
  { id: 'bar', label: 'Bar or pub' },
  { id: 'qsr', label: 'QSR / fast casual' },
  { id: 'hotel', label: 'Hotel F&B' },
  { id: 'other', label: 'Something else' },
] as const;

export function isVenueType(v: unknown): boolean {
  return VENUE_TYPES.some(t => t.id === v);
}

/** Same consent wording as the standalone form, so both mean the same thing. */
export const CONSENT_TEXT =
  'OK to send my report by email and occasionally share relevant hospitality tech insights. Unsubscribe any time.';

export interface StackEntry {
  tools: string[];
  other: string;
  none: boolean;
  nps: Record<string, number>;
}

export type Stack = Record<string, StackEntry>;

/** NPS key for a typed-in tool, matching the form. */
export const otherKey = (name: string) => `__other__:${name.trim()}`;

export function bandForSiteCount(n: number): string {
  if (!n || n < 1) return '';
  if (n === 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 20) return '6-20';
  return '20+';
}

function segmentFor(venueType: string, sites: string): string {
  if (venueType === 'bar') return 'bar-pub';
  if (venueType === 'qsr') return 'qsr';
  if (venueType === 'hotel') return 'hotel';
  if (sites === '1') return 'indie-small';
  return 'indie-group';
}

function siteMultiplier(sites: string): number {
  return ({ '1': 1, '2-5': 3, '6-20': 10, '20+': 25 } as Record<string, number>)[sites] || 1;
}

const BENCHMARKS: Record<string, { adoption: Record<string, number>; topTools: Record<string, string[]> }> = {
  'indie-small': {
    adoption: { pos: 97, payments: 99, workforce: 48, inventory: 34, loyalty: 32, learning: 22 },
    topTools: { pos: ['Square', 'Lightspeed', 'SumUp POS'], payments: ['Dojo', 'SumUp', 'sunday'], workforce: ['Deputy', 'Planday', 'Bizimply'], inventory: ['MarketMan', 'Growyze'], loyalty: ['Stampede', 'Airship'], learning: ['Tayl', 'CPL Learning'] },
  },
  'indie-group': {
    adoption: { pos: 99, payments: 99, workforce: 86, inventory: 71, loyalty: 61, learning: 58 },
    topTools: { pos: ['Zonal', 'Lightspeed', 'Toast'], payments: ['Dojo', 'sunday', 'Adyen'], workforce: ['Harri', 'Fourth', 'Rotaready', 's4labour'], inventory: ['Nory', 'Apicbase', 'MarketMan'], loyalty: ['Airship', 'Acteol', 'Stampede'], learning: ['Tayl', 'CPL Learning', '5Mins AI'] },
  },
  'bar-pub': {
    adoption: { pos: 97, payments: 99, workforce: 71, inventory: 51, loyalty: 38, learning: 38 },
    topTools: { pos: ['Zonal', 'Tevalis', 'Lightspeed'], payments: ['Dojo', 'DNA Payments', 'Adyen'], workforce: ['Harri', 'Bizimply', 's4labour'], inventory: ['Purchase Warrior (triSaaS)', 'MarketMan'], loyalty: ['Stampede', 'Krowd', 'Airship'], learning: ['CPL Learning', 'Tayl'] },
  },
  qsr: {
    adoption: { pos: 99, payments: 99, workforce: 84, inventory: 78, loyalty: 71, learning: 62 },
    topTools: { pos: ['Toast', 'Vita Mojo', 'Tissl'], payments: ['Stripe', 'Adyen', 'Dojo'], workforce: ['Harri', 'Deputy', 'Planday'], inventory: ['Nory', 'MarketMan', 'Apicbase'], loyalty: ['Airship', 'Paytronix', 'Krowd'], learning: ['Tayl', '5Mins AI', 'CPL Learning'] },
  },
  hotel: {
    adoption: { pos: 94, payments: 99, workforce: 82, inventory: 68, loyalty: 71, learning: 71 },
    topTools: { pos: ['Zonal', 'Lightspeed', 'NFS Hospitality'], payments: ['Adyen', 'Dojo'], workforce: ['Fourth', 'Alkimii', 'Harri'], inventory: ['Purchase Warrior (triSaaS)', 'Apicbase'], loyalty: ['Airship', 'Acteol'], learning: ['CPL Learning', 'Tayl'] },
  },
};

const ROI: Record<string, { hrs: number; gbp: number }> = {
  pos: { hrs: 1, gbp: 800 },
  payments: { hrs: 1, gbp: 2400 },
  workforce: { hrs: 4, gbp: 7500 },
  inventory: { hrs: 4, gbp: 9500 },
  loyalty: { hrs: 1, gbp: 4200 },
  learning: { hrs: 1, gbp: 1600 },
};

const SWITCH_FACTOR = 0.1;

function covers(e: StackEntry | undefined): boolean {
  return Boolean(e && !e.none && ((e.tools || []).length > 0 || (e.other || '').trim()));
}

/** The form's buildReport, trimmed to the fields stored on a submission. */
export function scoreReview(venueType: string, siteCount: number, stack: Stack) {
  const sites = bandForSiteCount(siteCount);
  const segment = segmentFor(venueType, sites);
  const bench = BENCHMARKS[segment];
  const mult = siteMultiplier(sites);
  const scored = REVIEW_CATEGORIES.filter(c => c.scored);

  const covered = scored.filter(c => covers(stack[c.id]));
  const coverage = Math.round((covered.length / scored.length) * 100);

  const gaps = scored
    .filter(c => !covers(stack[c.id]))
    .map(c => ({ c, peerPct: bench.adoption[c.id] || 0, hrs: (ROI[c.id]?.hrs || 0) * mult, gbp: (ROI[c.id]?.gbp || 0) * mult }))
    .filter(g => g.peerPct >= 35)
    .sort((a, b) => b.gbp - a.gbp);

  const switches = covered
    .map(c => ({ hrs: Math.round((ROI[c.id]?.hrs || 0) * SWITCH_FACTOR) * mult, gbp: Math.round((ROI[c.id]?.gbp || 0) * SWITCH_FACTOR) * mult }))
    .filter(s => s.gbp > 0);

  const totalGbp = gaps.reduce((t, g) => t + g.gbp, 0) + switches.reduce((t, s) => t + s.gbp, 0);
  const totalHrs = gaps.reduce((t, g) => t + g.hrs, 0) + switches.reduce((t, s) => t + s.hrs, 0);

  let earned = 0;
  let available = 0;
  for (const c of scored) {
    const e = stack[c.id];
    const weight = Math.max(5, Math.round((bench.adoption[c.id] || 0) / 4));
    available += weight;
    if (!covers(e)) continue;
    let pts = weight * 0.5;
    if ((e!.tools || []).some(t => (bench.topTools[c.id] || []).includes(t))) pts += weight * 0.3;
    if ((e!.tools || []).length >= 2) pts += weight * 0.1;
    earned += pts;
  }
  let raw = available > 0 ? (earned / available) * 100 : 0;
  if (covered.length === scored.length) raw += 10;

  return {
    segment,
    sites,
    score: Math.max(0, Math.min(100, Math.round(raw))),
    coverage,
    totalGbp,
    totalHrs,
    gapCount: gaps.length,
    gapCategories: gaps.map(g => g.c.label),
  };
}

/** Flatten per-category NPS into { tool: score }, as the form does for product_nps. */
export function productNps(stack: Stack): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of Object.values(stack)) {
    for (const [key, score] of Object.entries(e?.nps || {})) {
      if (typeof score !== 'number') continue;
      const name = key.startsWith('__other__:') ? key.slice('__other__:'.length) : key;
      if (name) out[name] = score;
    }
  }
  return out;
}

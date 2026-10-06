// Stacked Renewals — operators track their software, what it costs and when
// each contract's notice period closes. Safe to import from client components:
// types, labels and date maths only. Data access lives in renewals-db.ts.

export const RENEWAL_CATEGORIES = [
  'pos',
  'payments',
  'reservations',
  'workforce',
  'inventory',
  'loyalty',
  'marketing',
  'learning',
  'finance_ops',
  'guest_feedback',
  'other',
] as const;

export type RenewalCategory = (typeof RENEWAL_CATEGORIES)[number];

export const RENEWAL_CATEGORY_LABELS: Record<RenewalCategory, string> = {
  pos: 'POS',
  payments: 'Payments',
  reservations: 'Reservations',
  workforce: 'Workforce',
  inventory: 'Inventory',
  loyalty: 'Loyalty',
  marketing: 'Marketing & CRM',
  learning: 'Learning',
  finance_ops: 'Finance ops',
  guest_feedback: 'Guest feedback',
  other: 'Other',
};

export function isRenewalCategory(v: unknown): v is RenewalCategory {
  return typeof v === 'string' && (RENEWAL_CATEGORIES as readonly string[]).includes(v);
}

export const COST_PERIODS = ['month', 'year', 'one_off'] as const;
export type CostPeriod = (typeof COST_PERIODS)[number];

export const STATUSES = ['active', 'cancelling', 'cancelled'] as const;
export type ToolStatus = (typeof STATUSES)[number];

export interface RenewalTool {
  id: string;
  name: string;
  supplier: string | null;
  category: RenewalCategory;
  sites: string | null;
  cost_amount: number | null;
  cost_period: CostPeriod;
  contract_start: string | null;
  term_months: number | null;
  renewal_date: string | null;
  notice_days: number | null;
  auto_renew: boolean;
  owner: string | null;
  notes: string | null;
  status: ToolStatus;
  source: 'intelligence' | 'manual' | 'upload';
  contract_name: string | null;
  has_contract: boolean;
  updated_at: string;
}

/** Fields an operator can edit. Everything else is set by the server. */
export const EDITABLE_FIELDS = [
  'name',
  'supplier',
  'category',
  'sites',
  'cost_amount',
  'cost_period',
  'contract_start',
  'term_months',
  'renewal_date',
  'notice_days',
  'auto_renew',
  'owner',
  'notes',
  'status',
] as const;

/** Alert emails go out this many days before a notice deadline. */
export const ALERT_THRESHOLDS = [60, 30, 14, 7, 1] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in the UK, as YYYY-MM-DD. Renewal dates are calendar dates, not instants. */
export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number): string {
  const d = parse(isoDate);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parse(toISO).getTime() - parse(fromISO).getTime()) / DAY_MS);
}

/**
 * The next renewal date that hasn't happened yet. A contract that auto-renews
 * on a known term rolls forward on its own, so an operator who never updates a
 * date still gets next year's alert. Without a term we can't know, so the
 * stored date stands — and shows as overdue.
 */
export function nextRenewal(t: Pick<RenewalTool, 'renewal_date' | 'auto_renew' | 'term_months'>, today = todayISO()): string | null {
  if (!t.renewal_date) return null;
  let date = t.renewal_date;
  if (t.auto_renew && t.term_months && t.term_months > 0) {
    // Always step from the original date, so a 31st doesn't drift to the 28th after February.
    for (let k = 1; date < today && k <= 600; k++) date = addMonths(t.renewal_date, k * t.term_months);
  }
  return date;
}

/** The last day to give notice before the next renewal. */
export function noticeDeadline(t: Pick<RenewalTool, 'renewal_date' | 'auto_renew' | 'term_months' | 'notice_days'>, today = todayISO()): string | null {
  const renewal = nextRenewal(t, today);
  if (!renewal) return null;
  return iso(new Date(parse(renewal).getTime() - (t.notice_days || 0) * DAY_MS));
}

/** Recurring cost per month. One-off costs don't count towards run rate. */
export function monthlyCost(t: Pick<RenewalTool, 'cost_amount' | 'cost_period' | 'status'>): number {
  if (t.status === 'cancelled' || t.cost_amount == null) return 0;
  if (t.cost_period === 'month') return Number(t.cost_amount);
  if (t.cost_period === 'year') return Number(t.cost_amount) / 12;
  return 0;
}

export function formatGBP(n: number, decimals = 0): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(parse(isoDate));
}

/** Month-to-month: can be left any month, so there's no deadline worth an alert. */
export function isRolling(t: Pick<RenewalTool, 'term_months'>): boolean {
  return t.term_months === 1;
}

/** The notice deadline that matters for a tool, with its urgency. Null when there's nothing to act on. */
export function deadlineFor(t: RenewalTool, today = todayISO()): { date: string; days: number; renewal: string } | null {
  if (t.status !== 'active' || !t.auto_renew || isRolling(t)) return null;
  const date = noticeDeadline(t, today);
  const renewal = nextRenewal(t, today);
  if (!date || !renewal) return null;
  return { date, renewal, days: daysBetween(today, date) };
}

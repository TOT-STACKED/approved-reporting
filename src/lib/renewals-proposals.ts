// Proposal comparison for Stacked Renewals: an operator lays a supplier's
// quote over the tools it would replace, and sees the run rate, cost per site
// and total over the term side by side. Safe to import from client
// components: types and maths only. Data access lives in renewals-db.ts.

import {
  RENEWAL_CATEGORIES,
  isRenewalCategory,
  monthlyCost,
  nextRenewal,
  noticeDeadline,
  isRolling,
  todayISO,
  daysBetween,
  type RenewalCategory,
  type RenewalTool,
} from './renewals-shared';

export const LINE_KINDS = ['software', 'hardware', 'setup', 'payments', 'support', 'other'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  software: 'Software',
  hardware: 'Hardware',
  setup: 'Setup & training',
  payments: 'Payments',
  support: 'Support',
  other: 'Other',
};

export type LinePeriod = 'month' | 'year' | 'one_off';
/** per_site: the price applies at every site (× quantity per site). total: one price for the whole group. */
export type LineBasis = 'per_site' | 'total';

export interface ProposalLine {
  label: string;
  kind: LineKind;
  amount: number;
  period: LinePeriod;
  basis: LineBasis;
  quantity: number;
}

export interface Proposal {
  id: string;
  supplier: string | null;
  name: string;
  category: RenewalCategory;
  replaces: string[];
  sites: number | null;
  term_months: number | null;
  start_date: string | null;
  lines: ProposalLine[];
  notes: string | null;
  file_name: string | null;
  has_file: boolean;
  created_at: string;
  updated_at: string;
}

/** Term used when a proposal doesn't state one. Three years is the usual hospitality hardware deal. */
export const DEFAULT_TERM_MONTHS = 36;

export function isLineKind(v: unknown): v is LineKind {
  return typeof v === 'string' && (LINE_KINDS as readonly string[]).includes(v);
}

/** Validate one line from the browser or the extractor. Returns null for a line with no usable price. */
export function cleanLine(v: unknown): ProposalLine | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const amount = Number(typeof r.amount === 'string' ? r.amount.replace(/[£,\s]/g, '') : r.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return null;
  const qty = Number(r.quantity);
  return {
    label: String(r.label ?? '').trim().slice(0, 120) || 'Item',
    kind: isLineKind(r.kind) ? r.kind : 'other',
    amount: Math.round(amount * 100) / 100,
    period: r.period === 'year' || r.period === 'one_off' ? r.period : 'month',
    basis: r.basis === 'total' ? 'total' : 'per_site',
    quantity: Number.isFinite(qty) && qty > 0 && qty <= 10_000 ? Math.round(qty * 100) / 100 : 1,
  };
}

export function cleanCategory(v: unknown): RenewalCategory {
  return isRenewalCategory(v) ? v : 'other';
}

/** What one line costs the whole group, per month (recurring) or once. */
export function lineCost(l: ProposalLine, sites: number): { monthly: number; oneOff: number } {
  const total = l.amount * l.quantity * (l.basis === 'per_site' ? sites : 1);
  if (l.period === 'one_off') return { monthly: 0, oneOff: total };
  return { monthly: l.period === 'year' ? total / 12 : total, oneOff: 0 };
}

export interface ToolExit {
  tool: RenewalTool;
  /** The day it can end without paying a further term. */
  ends: string | null;
  /** Last day to give notice for that end date. */
  noticeBy: string | null;
  /** True when this cycle's notice deadline has already passed, so it runs one more term. */
  missedThisCycle: boolean;
  /** What it costs to keep paying it from today until it ends. */
  costUntilEnd: number;
}

export interface Comparison {
  sites: number;
  months: number;
  current: { monthly: number; total: number; perSiteMonthly: number; perSiteTotal: number; missingCost: RenewalTool[] };
  proposed: {
    monthly: number;
    oneOff: number;
    total: number;
    perSiteMonthly: number;
    perSiteOneOff: number;
    perSiteTotal: number;
    byKind: { kind: LineKind; monthly: number; oneOff: number }[];
  };
  /** Positive = the proposal saves money. */
  saving: { monthly: number; total: number; perSiteTotal: number };
  /** Months for the monthly saving to pay back the one-off costs. Null when it never does. */
  paybackMonths: number | null;
  stack: { today: number; after: number };
  exits: ToolExit[];
  /** Earliest date every replaced tool can end without paying another term. */
  cleanSwitch: string | null;
  /** Earliest notice date among the tools being replaced. */
  firstNoticeBy: string | null;
  /** Paying both until current contracts end, if the new one started today. */
  overlapIfToday: number;
}

function monthsBetween(fromISO: string, toISO: string): number {
  return Math.max(0, daysBetween(fromISO, toISO) / (365.25 / 12));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** When a tool could end, if notice went in as soon as possible. */
export function exitFor(tool: RenewalTool, today = todayISO()): ToolExit {
  const monthly = monthlyCost(tool);
  const base = { tool, missedThisCycle: false };
  if (isRolling(tool) || !tool.auto_renew) {
    // Rolling monthly or a fixed term that simply ends: gone after its notice period, or at its end date.
    const ends = !tool.auto_renew && tool.renewal_date && tool.renewal_date > today
      ? tool.renewal_date
      : addDays(today, tool.notice_days || 30);
    return { ...base, ends, noticeBy: today, costUntilEnd: monthly * monthsBetween(today, ends) };
  }
  const renewal = nextRenewal(tool, today);
  const deadline = noticeDeadline(tool, today);
  if (!renewal || !deadline) return { ...base, ends: null, noticeBy: null, costUntilEnd: 0 };
  if (deadline >= today) {
    return { ...base, ends: renewal, noticeBy: deadline, costUntilEnd: monthly * monthsBetween(today, renewal) };
  }
  // Notice window for this renewal has closed: it runs another term.
  const term = tool.term_months || 12;
  const following = nextRenewal({ renewal_date: renewal, auto_renew: true, term_months: term }, addDays(renewal, 1));
  const followingDeadline = following
    ? noticeDeadline({ renewal_date: following, auto_renew: true, term_months: term, notice_days: tool.notice_days }, today)
    : null;
  return {
    ...base,
    missedThisCycle: true,
    ends: following,
    noticeBy: followingDeadline,
    costUntilEnd: following ? monthly * monthsBetween(today, following) : 0,
  };
}

export function compareProposal(
  p: Pick<Proposal, 'lines' | 'replaces' | 'sites' | 'term_months'>,
  tools: RenewalTool[],
  orgSiteCount: number | null,
  today = todayISO()
): Comparison {
  const sites = Math.max(1, p.sites || orgSiteCount || 1);
  const months = p.term_months || DEFAULT_TERM_MONTHS;
  const live = tools.filter(t => t.status !== 'cancelled');
  const replaced = live.filter(t => p.replaces.includes(t.id));

  const currentMonthly = replaced.reduce((s, t) => s + monthlyCost(t), 0);
  const missingCost = replaced.filter(t => t.cost_amount == null);

  const byKindMap = new Map<LineKind, { monthly: number; oneOff: number }>();
  let proposedMonthly = 0;
  let proposedOneOff = 0;
  for (const l of p.lines) {
    const c = lineCost(l, sites);
    proposedMonthly += c.monthly;
    proposedOneOff += c.oneOff;
    const k = byKindMap.get(l.kind) || { monthly: 0, oneOff: 0 };
    byKindMap.set(l.kind, { monthly: k.monthly + c.monthly, oneOff: k.oneOff + c.oneOff });
  }
  const byKind = LINE_KINDS.filter(k => byKindMap.has(k)).map(k => ({ kind: k, ...byKindMap.get(k)! }));

  const currentTotal = currentMonthly * months;
  const proposedTotal = proposedMonthly * months + proposedOneOff;
  const monthlySaving = currentMonthly - proposedMonthly;

  const stackToday = live.reduce((s, t) => s + monthlyCost(t), 0) * 12;
  const stackAfter = stackToday - currentMonthly * 12 + proposedMonthly * 12;

  const exits = replaced.map(t => exitFor(t, today));
  const ends = exits.map(e => e.ends).filter((d): d is string => Boolean(d)).sort();
  const notices = exits.map(e => e.noticeBy).filter((d): d is string => Boolean(d)).sort();

  return {
    sites,
    months,
    current: {
      monthly: currentMonthly,
      total: currentTotal,
      perSiteMonthly: currentMonthly / sites,
      perSiteTotal: currentTotal / sites,
      missingCost,
    },
    proposed: {
      monthly: proposedMonthly,
      oneOff: proposedOneOff,
      total: proposedTotal,
      perSiteMonthly: proposedMonthly / sites,
      perSiteOneOff: proposedOneOff / sites,
      perSiteTotal: proposedTotal / sites,
      byKind,
    },
    saving: { monthly: monthlySaving, total: currentTotal - proposedTotal, perSiteTotal: (currentTotal - proposedTotal) / sites },
    paybackMonths: proposedOneOff > 0 && monthlySaving > 0 ? proposedOneOff / monthlySaving : proposedOneOff === 0 && monthlySaving > 0 ? 0 : null,
    stack: { today: stackToday, after: stackAfter },
    exits,
    cleanSwitch: ends.length ? ends[ends.length - 1] : null,
    firstNoticeBy: notices.length ? notices[0] : null,
    overlapIfToday: exits.reduce((s, e) => s + e.costUntilEnd, 0),
  };
}

export { RENEWAL_CATEGORIES };

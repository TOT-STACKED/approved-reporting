// Venue marketplace subscribers and their reveals, in the Stacked website
// Airtable base alongside Partner Users — same credentials, no new token.
//
//   Venue Subscribers — one row per paying email. Written by the Stripe
//                       webhook; the team revokes access by deleting the row.
//   Venue Reveals     — one row per venue a subscriber has unlocked. Counted
//                       against their monthly allowance from Period Start.
//
// Field IDs, not names, so renaming a column in Airtable can't break billing.

import { isCategory, PLANS, type Category, type PlanId } from './venue-plans';
import { findUserByEmail } from './partner-users';
import { tierForSlug } from './partner-package';

const BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID;
const KEY = process.env.MARKETPLACE_AIRTABLE_KEY;
const SUBS = process.env.VENUE_SUBSCRIBERS_TABLE || 'tblvb74wieKVVbrQZ';
const REVEALS = process.env.VENUE_REVEALS_TABLE || 'tblbteUt3FR4CFpgm';

const S = {
  email: 'fldjnKixB9ewkub4v',
  name: 'fldxsWlki0pyp4aqy',
  company: 'fldvSWeRqax1UJ40q',
  plan: 'fldNr7UGE611xYMmY',
  categories: 'fldVliaN9NcqPxwc5',
  status: 'fldEqNMwaPy8oSoSQ',
  periodStart: 'fldSgbsDzHOnHsJbO',
  bonus: 'fldqE8fVxLwCrPWei',
  customer: 'fld5CC6ydUdMyWtEv',
  subscription: 'fldOM0Rt3v0sOxv8R',
  lastSignedIn: 'fldpUm6qcmi5DH7Fv',
} as const;

const R = {
  key: 'fldJgYFoTP53VI4IR',
  email: 'fldnZPzk2owOE0Rww',
  venueId: 'fldp5GVU8O17IeZlr',
  venueName: 'fldmfe52aJlFrJlrs',
  usedBonus: 'fld8i6ZlXXY1k8WtJ',
  revealedAt: 'fldeO4pC6o3vhkzij',
} as const;

export type SubscriberStatus = 'active' | 'past_due' | 'cancelled';

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  company: string;
  plan: 'starter' | 'bundle';
  categories: Category[];
  status: SubscriberStatus;
  periodStart: string;
  bonus: number;
  customer: string;
  subscription: string;
}

type AirtableRecord = { id: string; fields?: Record<string, unknown> };

function configured(): boolean {
  return Boolean(BASE && KEY);
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

function url(table: string, path = ''): URL {
  return new URL(`https://api.airtable.com/v0/${BASE}/${table}${path}`);
}

function norm(email: string): string {
  return email.trim().toLowerCase();
}

/** Airtable formula string literal — escape so an email can't break out of it. */
function lit(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function select(table: string, formula: string): Promise<AirtableRecord[]> {
  if (!configured()) return [];
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const u = url(table);
    u.searchParams.set('returnFieldsByFieldId', 'true');
    u.searchParams.set('pageSize', '100');
    u.searchParams.set('filterByFormula', formula);
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: headers(), cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { records?: AirtableRecord[]; offset?: string };
    out.push(...(json.records || []));
    offset = json.offset;
  } while (offset);
  return out;
}

async function write(
  table: string,
  method: 'POST' | 'PATCH',
  fields: Record<string, unknown>,
  id?: string
): Promise<AirtableRecord> {
  const res = await fetch(url(table, id ? `/${id}` : ''), {
    method,
    headers: headers(),
    body: JSON.stringify({ fields, typecast: true, returnFieldsByFieldId: true }),
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return (await res.json()) as AirtableRecord;
}

function toSubscriber(r: AirtableRecord): Subscriber {
  const f = r.fields || {};
  const plan = String(f[S.plan] || '').toLowerCase() === 'bundle' ? 'bundle' : 'starter';
  const status = String(f[S.status] || 'active') as SubscriberStatus;
  return {
    id: r.id,
    email: norm(String(f[S.email] || '')),
    name: String(f[S.name] || ''),
    company: String(f[S.company] || ''),
    plan,
    categories: ((f[S.categories] as unknown[]) || []).filter(isCategory),
    status: ['active', 'past_due', 'cancelled'].includes(status) ? status : 'active',
    periodStart: String(f[S.periodStart] || ''),
    bonus: Number(f[S.bonus] || 0),
    customer: String(f[S.customer] || ''),
    subscription: String(f[S.subscription] || ''),
  };
}

export async function findSubscriber(email: string): Promise<Subscriber | null> {
  const rows = await select(SUBS, `LOWER({${S.email}})=${lit(norm(email))}`);
  return rows[0] ? toSubscriber(rows[0]) : null;
}

export async function findSubscriberBySubscription(subId: string): Promise<Subscriber | null> {
  const rows = await select(SUBS, `{${S.subscription}}=${lit(subId)}`);
  return rows[0] ? toSubscriber(rows[0]) : null;
}

/**
 * Create or update the row for a completed checkout. Idempotent — the webhook
 * and the post-checkout redirect both call it, whichever lands first wins and
 * the second is a no-op rewrite of the same values.
 */
export async function upsertSubscriber(input: {
  email: string;
  name?: string;
  company?: string;
  plan: 'starter' | 'bundle';
  categories: Category[];
  customer: string;
  subscription: string;
  periodStart: string;
}): Promise<{ subscriber: Subscriber; replaced: string | null }> {
  const existing = await findSubscriber(input.email);
  const fields: Record<string, unknown> = {
    [S.email]: norm(input.email),
    [S.plan]: input.plan === 'bundle' ? 'Bundle' : 'Starter',
    [S.categories]: input.categories,
    [S.status]: 'active',
    [S.customer]: input.customer,
    [S.subscription]: input.subscription,
  };
  if (input.name) fields[S.name] = input.name;
  if (input.company) fields[S.company] = input.company;
  // A resubscribe on the same subscription keeps its period; a new one resets it.
  if (!existing || existing.subscription !== input.subscription) {
    fields[S.periodStart] = input.periodStart;
  }
  const rec = existing
    ? await write(SUBS, 'PATCH', fields, existing.id)
    : await write(SUBS, 'POST', { ...fields, [S.bonus]: 0 });
  // An earlier, still-live subscription on this email is the plan they've just
  // moved off — the caller cancels it so they aren't billed for both.
  const replaced =
    existing?.subscription && existing.subscription !== input.subscription && existing.status !== 'cancelled'
      ? existing.subscription
      : null;
  return { subscriber: toSubscriber(rec), replaced };
}

export async function updateSubscriber(
  id: string,
  patch: Partial<{ status: SubscriberStatus; periodStart: string; bonus: number }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.status) fields[S.status] = patch.status;
  if (patch.periodStart) fields[S.periodStart] = patch.periodStart;
  if (typeof patch.bonus === 'number') fields[S.bonus] = patch.bonus;
  await write(SUBS, 'PATCH', fields, id);
}

export async function touchSubscriberSignIn(id: string): Promise<void> {
  try {
    await write(SUBS, 'PATCH', { [S.lastSignedIn]: new Date().toISOString() }, id);
  } catch {
    /* best effort */
  }
}

// --- Entitlement ------------------------------------------------------------

export interface Entitlement {
  email: string;
  name: string;
  plan: PlanId;
  status: SubscriberStatus;
  categories: Category[];
  insights: boolean;
  allowance: number;
  used: number;
  bonus: number;
  periodStart: string;
  revealed: Set<string>;
  subscriberId: string | null;
  canManageBilling: boolean;
}

function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function revealsFor(email: string): Promise<AirtableRecord[]> {
  return select(REVEALS, `LOWER({${R.email}})=${lit(norm(email))}`);
}

/**
 * What a signed-in email may see. A paying subscriber first; failing that an
 * Approved partner's colleague, who gets the Bundle as part of their package.
 * Null means "signed in but nothing to show" — treat as anonymous.
 */
export async function entitlementFor(email: string): Promise<Entitlement | null> {
  const sub = await findSubscriber(email);

  let base: Omit<Entitlement, 'used' | 'revealed'> | null = null;

  if (sub && sub.status !== 'cancelled') {
    const spec = PLANS[sub.plan];
    base = {
      email: sub.email,
      name: sub.name,
      plan: sub.plan,
      status: sub.status,
      categories: spec.allCategories ? [] : sub.categories,
      insights: spec.insights,
      allowance: spec.reveals,
      bonus: sub.bonus,
      periodStart: sub.periodStart || startOfMonth(),
      subscriberId: sub.id,
      canManageBilling: Boolean(sub.customer),
    };
  } else {
    const user = await findUserByEmail(email);
    if (user?.slug && (await tierForSlug(user.slug)) === 'approved') {
      base = {
        email: norm(email),
        name: user.name,
        plan: 'partner',
        status: 'active',
        categories: [],
        insights: true,
        allowance: PLANS.partner.reveals,
        bonus: sub?.bonus || 0,
        periodStart: startOfMonth(),
        subscriberId: sub?.id || null,
        canManageBilling: false,
      };
    }
  }
  if (!base) return null;

  const rows = await revealsFor(base.email);
  const since = Date.parse(base.periodStart) || 0;
  let used = 0;
  const revealed = new Set<string>();
  for (const r of rows) {
    const f = r.fields || {};
    revealed.add(String(f[R.venueId] || ''));
    const at = Date.parse(String(f[R.revealedAt] || '')) || 0;
    if (at >= since && !f[R.usedBonus]) used++;
  }
  return { ...base, used, revealed };
}

/** Which categories this entitlement can read. Empty list on the plan = all. */
export function categoriesFor(ent: Entitlement): Category[] | 'all' {
  return PLANS[ent.plan].allCategories ? 'all' : ent.categories;
}

export async function recordReveal(input: {
  email: string;
  venueId: string;
  venueName: string;
  usedBonus: boolean;
}): Promise<void> {
  await write(REVEALS, 'POST', {
    [R.key]: `${norm(input.email)}|${input.venueId}`,
    [R.email]: norm(input.email),
    [R.venueId]: input.venueId,
    [R.venueName]: input.venueName,
    [R.usedBonus]: input.usedBonus,
    [R.revealedAt]: new Date().toISOString(),
  });
}

export async function addBonus(email: string, reveals: number): Promise<void> {
  const sub = await findSubscriber(email);
  if (sub) {
    await updateSubscriber(sub.id, { bonus: sub.bonus + reveals });
    return;
  }
  // An Approved partner topping up has no subscriber row yet — make one to
  // hold the balance. Status cancelled keeps it from granting a plan.
  await write(SUBS, 'POST', {
    [S.email]: norm(email),
    [S.status]: 'cancelled',
    [S.bonus]: reveals,
  });
}

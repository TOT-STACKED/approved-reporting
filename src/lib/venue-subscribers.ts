// Venue marketplace access and reveals, in the Stacked website Airtable base
// alongside Partner Users — same credentials, no new token.
//
// Who gets in is decided by the partner's Package (Promote only), not by this
// table. These tables only hold what a Promote user has done with it:
//
//   Venue Subscribers — one row per signed-in email, holding the categories
//                       they picked and the month they picked them for, plus
//                       any bought tokens (Bonus) and the Stripe sessions
//                       already credited for them.
//   Venue Reveals     — one row per venue a user has unlocked, counted
//                       against the month's allowance.
//
// Field IDs, not names, so renaming a column in Airtable can't break access.

import { isCategory, PROMOTE, type Category, type PlanId } from './venue-plans';
import { findUserByEmail } from './partner-users';
import { packageForSlug } from './partner-package';

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
  topupSessions: 'fldFYrXxzhZUYKQkz',
} as const;

const R = {
  key: 'fldJgYFoTP53VI4IR',
  email: 'fldnZPzk2owOE0Rww',
  venueId: 'fldp5GVU8O17IeZlr',
  venueName: 'fldmfe52aJlFrJlrs',
  usedBonus: 'fld8i6ZlXXY1k8WtJ',
  revealedAt: 'fldeO4pC6o3vhkzij',
} as const;

export interface Subscriber {
  id: string;
  email: string;
  categories: Category[];
  periodStart: string;
  bonus: number;
  customer: string;
  topupSessions: string[];
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
  return {
    id: r.id,
    email: norm(String(f[S.email] || '')),
    categories: ((f[S.categories] as unknown[]) || []).filter(isCategory),
    periodStart: String(f[S.periodStart] || ''),
    bonus: Number(f[S.bonus] || 0),
    customer: String(f[S.customer] || ''),
    topupSessions: String(f[S.topupSessions] || '').split(/\s+/).filter(Boolean),
  };
}

export async function findSubscriber(email: string): Promise<Subscriber | null> {
  const rows = await select(SUBS, `LOWER({${S.email}})=${lit(norm(email))}`);
  return rows[0] ? toSubscriber(rows[0]) : null;
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
  company: string;
  plan: PlanId;
  /** This month's picks. Empty means they haven't chosen yet this month. */
  categories: Category[];
  insights: boolean;
  allowance: number;
  used: number;
  /** Bought tokens left. Never expire; spent after the monthly allowance. */
  bonus: number;
  periodStart: string;
  revealed: Set<string>;
  subscriberId: string | null;
}

/** The 1st of this month, UTC — when the allowance and the category pick reset. */
export function startOfMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function revealsFor(email: string): Promise<AirtableRecord[]> {
  return select(REVEALS, `LOWER({${R.email}})=${lit(norm(email))}`);
}

/**
 * What a signed-in email may see: a Partner Users login whose partner's
 * Package is Promote. Anyone else — Lite, Approved, no partner — gets null,
 * which the pages treat as "signed in, no access".
 */
export async function entitlementFor(email: string): Promise<Entitlement | null> {
  const user = await findUserByEmail(email);
  if (!user?.slug || (await packageForSlug(user.slug)) !== 'promote') return null;

  const periodStart = startOfMonth();
  const since = Date.parse(periodStart);
  const [sub, rows] = await Promise.all([findSubscriber(email), revealsFor(email)]);
  const pickedThisMonth = sub && (Date.parse(sub.periodStart) || 0) >= since;

  let used = 0;
  const revealed = new Set<string>();
  for (const r of rows) {
    const f = r.fields || {};
    revealed.add(String(f[R.venueId] || ''));
    const at = Date.parse(String(f[R.revealedAt] || '')) || 0;
    if (at >= since && !f[R.usedBonus]) used++;
  }

  return {
    email: norm(email),
    name: user.name,
    company: user.slug,
    plan: 'promote',
    categories: pickedThisMonth ? sub.categories.slice(0, PROMOTE.maxCategories) : [],
    insights: PROMOTE.insights,
    allowance: PROMOTE.reveals,
    used,
    bonus: sub?.bonus || 0,
    periodStart,
    revealed,
    subscriberId: sub?.id || null,
  };
}

/** Save this month's category pick, creating the row on first use. */
export async function saveCategories(ent: Entitlement, categories: Category[]): Promise<void> {
  const existing = await findSubscriber(ent.email);
  const fields: Record<string, unknown> = {
    [S.email]: ent.email,
    [S.name]: ent.name,
    [S.company]: ent.company,
    [S.plan]: PROMOTE.name,
    [S.status]: 'active',
    [S.categories]: categories,
    [S.periodStart]: ent.periodStart,
  };
  await write(SUBS, existing ? 'PATCH' : 'POST', fields, existing?.id);
}

/** Spend one bought token. */
export async function spendBonus(ent: Entitlement): Promise<void> {
  if (!ent.subscriberId) throw new Error('no subscriber row to spend from');
  await write(SUBS, 'PATCH', { [S.bonus]: Math.max(0, ent.bonus - 1) }, ent.subscriberId);
}

/**
 * Credit a paid top-up. Idempotent on the Stripe session ID: the webhook and
 * the return redirect both call this, and only the first adds the tokens.
 */
export async function creditTopup(input: {
  email: string;
  sessionId: string;
  tokens: number;
  customer?: string;
}): Promise<void> {
  const existing = await findSubscriber(input.email);
  if (existing?.topupSessions.includes(input.sessionId)) return;
  const fields: Record<string, unknown> = {
    [S.email]: norm(input.email),
    [S.bonus]: (existing?.bonus || 0) + input.tokens,
    [S.topupSessions]: [...(existing?.topupSessions || []), input.sessionId].join('\n'),
  };
  if (input.customer) fields[S.customer] = input.customer;
  await write(SUBS, existing ? 'PATCH' : 'POST', fields, existing?.id);
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

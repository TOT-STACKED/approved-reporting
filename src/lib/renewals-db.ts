// Data access for Stacked Renewals. Supabase project kohnakdevwfudzgfjmab —
// the same one that holds Intelligence Review submissions, so a new account's
// stack is seeded from its own review. Reuses the marketplace's service-role
// env vars; every table has RLS on with no policies, so nothing but this
// server can touch them.
//
// Every read and write here is scoped by org_id, and org_id only ever comes
// from the signed-in member's row. A tool id from the browser is never trusted
// on its own.

import {
  EDITABLE_FIELDS,
  isRenewalCategory,
  type RenewalTool,
} from './renewals-shared';

const URL_ = process.env.VENUES_SUPABASE_URL;
const KEY = process.env.VENUES_SUPABASE_KEY;
const BUCKET = 'renewals-contracts';

export function renewalsConfigured(): boolean {
  return Boolean(URL_ && KEY);
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  if (!URL_ || !KEY) throw new Error('VENUES_SUPABASE_URL / VENUES_SUPABASE_KEY not set');
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: headers((init.headers as Record<string, string>) || {}),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`supabase ${res.status} on ${path.split('?')[0]}: ${detail.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;

// ── Members and orgs ─────────────────────────────────────────────────────────

export interface Member {
  id: string;
  org_id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'member';
  alerts: boolean;
}

export interface Org {
  id: string;
  name: string;
  site_count: number | null;
  submission_id: string | null;
}

export interface Viewer {
  member: Member;
  org: Org;
}

export async function findMember(email: string): Promise<Member | null> {
  const rows = await rest<Member[]>(
    `renewals_members?email=eq.${enc(email.toLowerCase())}&select=id,org_id,email,name,role,alerts&limit=1`
  );
  return rows[0] || null;
}

export async function getOrg(id: string): Promise<Org | null> {
  const rows = await rest<Org[]>(`renewals_orgs?id=eq.${enc(id)}&select=id,name,site_count,submission_id&limit=1`);
  return rows[0] || null;
}

export async function viewerFor(email: string | null): Promise<Viewer | null> {
  if (!email || !renewalsConfigured()) return null;
  const member = await findMember(email);
  if (!member) return null;
  const org = await getOrg(member.org_id);
  return org ? { member, org } : null;
}

export async function touchSignIn(memberId: string): Promise<void> {
  await rest(`renewals_members?id=eq.${enc(memberId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_sign_in_at: new Date().toISOString() }),
  });
}

interface StackEntry {
  tools?: string[];
  other?: string;
  none?: boolean;
}

interface Submission {
  id: string;
  first_name: string | null;
  brand_trading_name: string | null;
  company: string | null;
  site_count: number | null;
  sites: string | null;
  stack: Record<string, StackEntry> | null;
}

/** The most recent Intelligence Review for an email — the ticket in. */
export async function findSubmission(email: string): Promise<Submission | null> {
  const rows = await rest<Submission[]>(
    // ilike for case, with its wildcards escaped: "_" is common in emails and must match only itself.
    `submissions?email=ilike.${enc(email.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`))}` +
    `&select=id,first_name,brand_trading_name,company,site_count,sites,stack&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}

/** Can this email sign in? Either they're already a member, or they've done an Intelligence Review. */
export async function canSignIn(email: string): Promise<{ name: string } | null> {
  const member = await findMember(email);
  if (member) return { name: member.name || '' };
  const sub = await findSubmission(email);
  return sub ? { name: sub.first_name || '' } : null;
}

/**
 * First sign-in for someone with an Intelligence Review: create their account
 * and seed it with every tool from their review, ready for costs and dates.
 */
export async function provisionFromSubmission(email: string): Promise<Member | null> {
  const sub = await findSubmission(email);
  if (!sub) return null;

  const [org] = await rest<Org[]>('renewals_orgs?select=id,name,site_count,submission_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: (sub.brand_trading_name || sub.company || 'My venue').trim(),
      submission_id: sub.id,
      site_count: sub.site_count,
    }),
  });

  const [member] = await rest<Member[]>('renewals_members?select=id,org_id,email,name,role,alerts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ org_id: org.id, email: email.toLowerCase(), name: sub.first_name, role: 'owner' }),
  });

  const seeds: Record<string, unknown>[] = [];
  for (const [category, entry] of Object.entries(sub.stack || {})) {
    if (!entry || entry.none) continue;
    const names = [...(entry.tools || [])];
    const other = (entry.other || '').trim();
    if (other) names.push(other);
    for (const name of names) {
      seeds.push({
        org_id: org.id,
        name,
        category: isRenewalCategory(category) ? category : 'other',
        source: 'intelligence',
      });
    }
  }
  if (seeds.length) {
    await rest('renewals_tools', { method: 'POST', body: JSON.stringify(seeds) });
  }
  return member;
}

// ── Team ─────────────────────────────────────────────────────────────────────

export async function listMembers(orgId: string): Promise<Member[]> {
  return rest<Member[]>(
    `renewals_members?org_id=eq.${enc(orgId)}&select=id,org_id,email,name,role,alerts&order=created_at.asc`
  );
}

export class MemberExistsError extends Error {}

export async function addMember(orgId: string, email: string, name: string): Promise<Member> {
  const existing = await findMember(email);
  if (existing) throw new MemberExistsError(existing.org_id === orgId ? 'already-here' : 'elsewhere');
  const [m] = await rest<Member[]>('renewals_members?select=id,org_id,email,name,role,alerts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ org_id: orgId, email: email.toLowerCase(), name: name || null, role: 'member' }),
  });
  return m;
}

export async function removeMember(orgId: string, memberId: string): Promise<void> {
  await rest(`renewals_members?org_id=eq.${enc(orgId)}&id=eq.${enc(memberId)}&role=eq.member`, { method: 'DELETE' });
}

export async function setAlerts(memberId: string, alerts: boolean): Promise<void> {
  await rest(`renewals_members?id=eq.${enc(memberId)}`, { method: 'PATCH', body: JSON.stringify({ alerts }) });
}

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOL_COLUMNS = [
  'id', 'name', 'supplier', 'category', 'sites', 'cost_amount', 'cost_period', 'contract_start',
  'term_months', 'renewal_date', 'notice_days', 'auto_renew', 'owner', 'notes', 'status', 'source',
  'contract_name', 'contract_path', 'updated_at',
].join(',');

type ToolRow = Omit<RenewalTool, 'has_contract'> & { contract_path: string | null };

function toTool(r: ToolRow): RenewalTool {
  const { contract_path, ...rest_ } = r;
  return {
    ...rest_,
    category: isRenewalCategory(r.category) ? r.category : 'other',
    cost_amount: r.cost_amount == null ? null : Number(r.cost_amount),
    has_contract: Boolean(contract_path),
  };
}

export async function listTools(orgId: string): Promise<RenewalTool[]> {
  const rows = await rest<ToolRow[]>(
    `renewals_tools?org_id=eq.${enc(orgId)}&select=${TOOL_COLUMNS}&order=name.asc`
  );
  return rows.map(toTool);
}

async function getToolRow(orgId: string, id: string): Promise<ToolRow | null> {
  const rows = await rest<ToolRow[]>(
    `renewals_tools?org_id=eq.${enc(orgId)}&id=eq.${enc(id)}&select=${TOOL_COLUMNS}&limit=1`
  );
  return rows[0] || null;
}

export class ToolInputError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate and normalise whatever the browser sent. Unknown keys are dropped. */
export function cleanToolInput(input: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = (v: unknown, max = 200) => {
    if (v == null) return null;
    const s = String(v).trim().slice(0, max);
    return s || null;
  };
  const int = (v: unknown, min: number, max: number) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new ToolInputError('Check the numbers');
    return Math.round(n);
  };

  for (const key of EDITABLE_FIELDS) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'name': {
        const s = text(v);
        if (!s) throw new ToolInputError('Give the tool a name');
        out.name = s;
        break;
      }
      case 'category':
        out.category = isRenewalCategory(v) ? v : 'other';
        break;
      case 'cost_amount': {
        if (v === '' || v == null) { out.cost_amount = null; break; }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new ToolInputError('Check the cost');
        out.cost_amount = Math.round(n * 100) / 100;
        break;
      }
      case 'cost_period':
        out.cost_period = v === 'year' || v === 'one_off' ? v : 'month';
        break;
      case 'contract_start':
      case 'renewal_date':
        if (v === '' || v == null) out[key] = null;
        else if (typeof v === 'string' && DATE_RE.test(v)) out[key] = v;
        else throw new ToolInputError('Dates must be YYYY-MM-DD');
        break;
      case 'term_months':
        out.term_months = int(v, 1, 240);
        break;
      case 'notice_days':
        out.notice_days = int(v, 0, 730);
        break;
      case 'auto_renew':
        out.auto_renew = Boolean(v);
        break;
      case 'status':
        out.status = v === 'cancelling' || v === 'cancelled' ? v : 'active';
        break;
      case 'notes':
        out.notes = text(v, 2000);
        break;
      default:
        out[key] = text(v);
    }
  }
  if (!partial && !out.name) throw new ToolInputError('Give the tool a name');
  return out;
}

export async function createTool(orgId: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<RenewalTool> {
  const [row] = await rest<ToolRow[]>(`renewals_tools?select=${TOOL_COLUMNS}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...fields, ...extra, org_id: orgId }),
  });
  return toTool(row);
}

export async function updateTool(orgId: string, id: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<RenewalTool | null> {
  const rows = await rest<ToolRow[]>(
    `renewals_tools?org_id=eq.${enc(orgId)}&id=eq.${enc(id)}&select=${TOOL_COLUMNS}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, ...extra, updated_at: new Date().toISOString() }),
    }
  );
  return rows[0] ? toTool(rows[0]) : null;
}

export async function deleteTool(orgId: string, id: string): Promise<void> {
  const row = await getToolRow(orgId, id);
  if (!row) return;
  if (row.contract_path) await removeContract(row.contract_path).catch(() => {});
  await rest(`renewals_tools?org_id=eq.${enc(orgId)}&id=eq.${enc(id)}`, { method: 'DELETE' });
}

// ── Contract files ───────────────────────────────────────────────────────────

export async function uploadContract(orgId: string, bytes: Buffer): Promise<string> {
  // Path is ours, never the uploaded filename, so nothing from the browser lands in it.
  const path = `${orgId}/${crypto.randomUUID()}.pdf`;
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/pdf' },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return path;
}

export async function removeContract(path: string): Promise<void> {
  await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ prefixes: [path] }),
  });
}

/** A one-minute link to a tool's contract, only if the tool belongs to this org. */
export async function contractLink(orgId: string, toolId: string): Promise<string | null> {
  const row = await getToolRow(orgId, toolId);
  if (!row?.contract_path || !row.contract_path.startsWith(`${orgId}/`)) return null;
  const res = await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${row.contract_path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL?: string };
  return signedURL ? `${URL_}/storage/v1${signedURL}` : null;
}

/** Swap a tool's contract file, removing the old one. */
export async function attachContract(orgId: string, toolId: string, path: string, name: string): Promise<RenewalTool | null> {
  const row = await getToolRow(orgId, toolId);
  if (!row) return null;
  if (row.contract_path && row.contract_path !== path) await removeContract(row.contract_path).catch(() => {});
  return updateTool(orgId, toolId, {}, { contract_path: path, contract_name: name.slice(0, 200) });
}

/** Only accept a contract path the server issued for this org. */
export function ownsContractPath(orgId: string, path: unknown): path is string {
  return typeof path === 'string' && new RegExp(`^${orgId}/[0-9a-f-]{36}\\.pdf$`).test(path);
}

// ── Alerts (cron) ────────────────────────────────────────────────────────────

export interface AlertCandidate {
  tool: RenewalTool;
  orgId: string;
}

export async function allActiveTools(): Promise<AlertCandidate[]> {
  const rows = await rest<(ToolRow & { org_id: string })[]>(
    `renewals_tools?status=eq.active&auto_renew=is.true&renewal_date=not.is.null&select=${TOOL_COLUMNS},org_id&limit=10000`
  );
  return rows.map(r => ({ tool: toTool(r), orgId: r.org_id }));
}

export async function alertsSent(toolIds: string[]): Promise<Set<string>> {
  if (!toolIds.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < toolIds.length; i += 150) {
    const chunk = toolIds.slice(i, i + 150);
    const rows = await rest<{ tool_id: string; threshold: number; renewal_date: string }[]>(
      `renewals_alerts_sent?tool_id=in.(${chunk.join(',')})&select=tool_id,threshold,renewal_date`
    );
    for (const r of rows) out.add(`${r.tool_id}:${r.threshold}:${r.renewal_date}`);
  }
  return out;
}

export async function recordAlerts(rows: { tool_id: string; threshold: number; renewal_date: string }[]): Promise<void> {
  if (!rows.length) return;
  await rest('renewals_alerts_sent', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(rows),
  });
}

export async function alertRecipients(orgIds: string[]): Promise<Map<string, Member[]>> {
  const out = new Map<string, Member[]>();
  if (!orgIds.length) return out;
  const rows = await rest<Member[]>(
    `renewals_members?org_id=in.(${orgIds.join(',')})&alerts=is.true&select=id,org_id,email,name,role,alerts`
  );
  for (const m of rows) out.set(m.org_id, [...(out.get(m.org_id) || []), m]);
  return out;
}

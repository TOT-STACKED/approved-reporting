// Partner Users — the people who can sign in to the Intelligence dashboard.
//
// One row per person in the Partner Users table (Stacked website base, the
// same one the Package tier and the events feed already read, so no new
// credentials). Partners create their own row the first time they open their
// private link; the team never provisions accounts.
//
// Nothing secret is stored here. Sign-in is a 6-digit code sent to the email
// or mobile on the row, so a leak of this table exposes contact details we
// already hold, not credentials. Revoking access is deleting a row.

const BASE = process.env.MARKETPLACE_AIRTABLE_BASE_ID;
const KEY = process.env.MARKETPLACE_AIRTABLE_KEY;
const TABLE = process.env.PARTNER_USERS_TABLE || 'tblcaaQW2taMt90VF';

const F = {
  email: 'fldidKtp08VI3sVYB',
  name: 'fldP9vw2838mVQAdR',
  mobile: 'fld892y3MSaLtlCEL',
  partner: 'fld4sAOGx0k5tVWmF',
  slug: 'fldklwjXZXP6S64au',
  created: 'fldlnq4C42BEWp8wG',
  lastSignedIn: 'fldmj3uED1TCKjaww',
} as const;

export interface PartnerUser {
  id: string;
  email: string;
  name: string;
  mobile: string;
  slug: string;
}

function configured(): boolean {
  return Boolean(BASE && KEY);
}

function api(path = ''): string {
  return `https://api.airtable.com/v0/${BASE}/${TABLE}${path}`;
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

/** Emails and mobiles are compared loosely — people type them inconsistently. */
export function normaliseEmail(v: string): string {
  return v.trim().toLowerCase();
}

/** Strips spaces, brackets and a leading 0 or +44 so 07... and +447... match. */
export function normaliseMobile(v: string): string {
  const digits = v.replace(/[^\d+]/g, '');
  if (digits.startsWith('+44')) return `0${digits.slice(3)}`;
  if (digits.startsWith('44') && digits.length > 10) return `0${digits.slice(2)}`;
  return digits;
}

function toUser(rec: { id: string; fields?: Record<string, unknown> }): PartnerUser {
  const f = rec.fields || {};
  return {
    id: rec.id,
    email: String(f[F.email] || ''),
    name: String(f[F.name] || ''),
    mobile: String(f[F.mobile] || ''),
    slug: String(f[F.slug] || ''),
  };
}

async function listAll(): Promise<PartnerUser[]> {
  if (!configured()) return [];
  const out: PartnerUser[] = [];
  let offset: string | undefined;
  try {
    do {
      const url = new URL(api());
      url.searchParams.set('returnFieldsByFieldId', 'true');
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url, { headers: headers(), cache: 'no-store' });
      if (!res.ok) return out;
      const json = (await res.json()) as {
        records?: { id: string; fields?: Record<string, unknown> }[];
        offset?: string;
      };
      for (const r of json.records || []) out.push(toUser(r));
      offset = json.offset;
    } while (offset);
  } catch {
    /* fall through with whatever we have */
  }
  return out;
}

/**
 * Find the person signing in. Matches on email or mobile, whichever they
 * typed. Returns null rather than throwing so the caller can give the same
 * answer for "no such account" as for "code sent" — see the route.
 */
export async function findUser(identifier: string): Promise<PartnerUser | null> {
  const raw = identifier.trim();
  if (!raw) return null;
  const users = await listAll();

  if (raw.includes('@')) {
    const email = normaliseEmail(raw);
    return users.find(u => normaliseEmail(u.email) === email) || null;
  }
  const mobile = normaliseMobile(raw);
  if (mobile.length < 7) return null;
  return users.find(u => u.mobile && normaliseMobile(u.mobile) === mobile) || null;
}

export async function findUserByEmail(email: string): Promise<PartnerUser | null> {
  const target = normaliseEmail(email);
  const users = await listAll();
  return users.find(u => normaliseEmail(u.email) === target) || null;
}

export async function usersForSlug(slug: string): Promise<PartnerUser[]> {
  const users = await listAll();
  return users.filter(u => u.slug.trim().toLowerCase() === slug.trim().toLowerCase());
}

/**
 * Create an account. `partnerRecordId` links the row to the Partner record so
 * the team can see who has access from the partner's own row; it's optional
 * because the slug is what the app actually reads.
 */
export async function createUser(input: {
  email: string;
  name: string;
  mobile?: string;
  slug: string;
  partnerRecordId?: string | null;
}): Promise<PartnerUser | null> {
  if (!configured()) return null;

  const fields: Record<string, unknown> = {
    [F.email]: normaliseEmail(input.email),
    [F.name]: input.name.trim(),
    [F.slug]: input.slug,
    [F.created]: new Date().toISOString(),
  };
  if (input.mobile) fields[F.mobile] = input.mobile.trim();
  if (input.partnerRecordId) fields[F.partner] = [input.partnerRecordId];

  try {
    const res = await fetch(api(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fields, typecast: true, returnFieldsByFieldId: true }),
    });
    if (!res.ok) {
      console.warn('[partner-users] create failed', res.status, await res.text());
      return null;
    }
    return toUser(await res.json());
  } catch (err) {
    console.warn('[partner-users] create threw', err);
    return null;
  }
}

/** Best-effort — a failed timestamp write must never block a valid sign-in. */
export async function touchSignIn(userId: string): Promise<void> {
  if (!configured()) return;
  try {
    await fetch(api(`/${userId}`), {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields: { [F.lastSignedIn]: new Date().toISOString() } }),
    });
  } catch {
    /* ignore */
  }
}

/** The Partner record id for a slug, so a new user can be linked to it. */
export async function partnerRecordIdForSlug(slug: string): Promise<string | null> {
  if (!configured()) return null;
  const partnersTable = process.env.MARKETPLACE_PARTNERS_TABLE || 'Partners';
  try {
    const url = new URL(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(partnersTable)}`
    );
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', 'Slug');
    let offset: string | undefined;
    do {
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url, { headers: headers(), cache: 'no-store' });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        records?: { id: string; fields?: { Slug?: string } }[];
        offset?: string;
      };
      const hit = (json.records || []).find(
        r => (r.fields?.Slug || '').trim().toLowerCase() === slug.trim().toLowerCase()
      );
      if (hit) return hit.id;
      offset = json.offset;
    } while (offset);
  } catch {
    /* ignore */
  }
  return null;
}

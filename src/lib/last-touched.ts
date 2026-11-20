// When was a lead last really touched?
//
// Airtable's "Last Modified" on Master View watches every field, including
// the Stage Log link. So any bulk script that writes Stage Log rows (the
// 12 Nov and 18 Nov backfills) stamps every lead it links to as modified at
// that second, which made weeks-quiet SQLs and MQLs drop off the "chase" and
// "clean up" to-dos.
//
// A person editing leads doesn't change many records in the same second, so
// a second shared by BULK_MIN or more leads is treated as a script, not a
// touch. Those leads fall back to their latest real move (Stage Log), or the
// date the lead was added.

export const BULK_MIN = 5;

const second = (iso: string) => iso.slice(0, 19); // 2026-11-12T13:10:40

/** Seconds that BULK_MIN or more leads share as their Last Modified. */
export function bulkWriteSeconds(lastModified: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const lm of lastModified) {
    if (!lm) continue;
    const s = second(lm);
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return new Set(Array.from(counts).filter(([, n]) => n >= BULK_MIN).map(([s]) => s));
}

/**
 * Last Modified, unless it came from a bulk write; then the latest of the
 * fallbacks (real move dates, the lead's own date). Never later than the
 * original Last Modified.
 */
export function lastTouched(lastModified: string, bulk: Set<string>, fallbacks: (string | undefined | null)[]): string {
  if (!lastModified || !bulk.has(second(lastModified))) return lastModified;
  const best = fallbacks
    .filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)))
    .map(d => new Date(d).toISOString())
    .filter(d => d <= new Date(lastModified).toISOString())
    .sort()
    .pop();
  return best || '';
}

// ---------------------------------------------------------------------------
// Same business, more than one record.
//
// A business that goes quiet and comes back later often lands as a NEW lead
// record (new enquiry, new partner tagged) rather than a tag on the old one.
// The new record is fresh, but the old one sat in the stale lists forever.
// So records for the same business are grouped, and each one is as fresh as
// the most recently touched record in its group.
//
// Grouped on a cleaned-up business name, or a shared company email domain
// (never a free-mail domain like gmail, and never a domain that fronts more
// than MAX_NAMES_PER_DOMAIN differently named businesses, e.g. a consultant).
// ---------------------------------------------------------------------------

const NAME_NOISE = new Set(['the', 'ltd', 'limited', 'plc', 'llp', 'co', 'company', 'uk', 'group', 'and']);

/** "McManus Pubs (most info on other record)" and "McManus Pubs " -> "mcmanus pubs". */
export function businessKey(name: string | null | undefined): string {
  const words = (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')        // (Parent), (most info on other record)
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !NAME_NOISE.has(w));
  const key = words.join(' ');
  // Too short to be a safe match on its own ("bar", "pub").
  return key.length >= 3 ? key : '';
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk',
  'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'btinternet.com', 'sky.com',
  'protonmail.com', 'proton.me', 'msn.com', 'mail.com', 'virginmedia.com',
  // Our own domains (test and internal leads).
  'wearestacked.io', 'techontoast.co.uk', 'techontoast.com',
]);

/** A domain shared by more businesses than this is a consultant or agency, not one business. */
export const MAX_NAMES_PER_DOMAIN = 3;

export function emailDomainKey(email: string | null | undefined): string {
  const m = (email || '').toLowerCase().trim().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m || FREE_MAIL.has(m[1])) return '';
  return `@${m[1]}`;
}

export interface TouchRecord {
  id: string;
  name: string;
  email?: string;
  /** This record's own last-touched date (after the bulk-write correction). */
  touched: string;
}

export interface GroupTouch {
  /** Latest touch across every record for this business. */
  touched: string;
  /** Other records for the same business, by name (empty when there are none). */
  otherNames: string[];
}

/** Group records by business and give each the group's latest touch. */
export function groupByBusiness(records: TouchRecord[]): Map<string, GroupTouch> {
  // Union-find over record ids, joined by shared name key or email domain.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  // Domains that front several differently named businesses (a consultant
  // enquiring for many venues) don't link anything.
  const namesByDomain = new Map<string, Set<string>>();
  for (const rec of records) {
    const d = emailDomainKey(rec.email);
    if (!d) continue;
    const set = namesByDomain.get(d) || new Set<string>();
    set.add(businessKey(rec.name) || rec.id);
    namesByDomain.set(d, set);
  }
  const usableDomain = (d: string) => !!d && (namesByDomain.get(d)?.size ?? 0) <= MAX_NAMES_PER_DOMAIN;

  const firstByKey = new Map<string, string>();
  for (const rec of records) {
    parent.set(rec.id, rec.id);
    const domain = emailDomainKey(rec.email);
    for (const key of [businessKey(rec.name), usableDomain(domain) ? domain : '']) {
      if (!key) continue;
      const seen = firstByKey.get(key);
      if (seen) union(rec.id, seen); else firstByKey.set(key, rec.id);
    }
  }

  const groups = new Map<string, TouchRecord[]>();
  for (const rec of records) {
    const root = find(rec.id);
    const g = groups.get(root) || [];
    g.push(rec);
    groups.set(root, g);
  }

  const out = new Map<string, GroupTouch>();
  for (const g of groups.values()) {
    const touched = g.map(r => r.touched).filter(Boolean).sort().pop() || '';
    for (const rec of g) {
      out.set(rec.id, {
        touched: g.length > 1 ? touched : rec.touched,
        otherNames: g.filter(o => o.id !== rec.id).map(o => o.name.trim() || 'Unnamed lead'),
      });
    }
  }
  return out;
}

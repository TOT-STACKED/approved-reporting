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

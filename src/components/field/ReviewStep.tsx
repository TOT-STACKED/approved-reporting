'use client';

import { useState } from 'react';
import { Chip } from './FieldChrome';
import {
  CONSENT_TEXT,
  REVIEW_CATEGORIES,
  VENUE_TYPES,
  otherKey,
  scoreReview,
  type Stack,
  type StackEntry,
} from '@/lib/intelligence-review';
import type { FieldStack } from '@/lib/field-shared';

// The full Intelligence Review, done with the operator during a visit. Saved
// as a normal review in the main system (see lib/field-review.ts), so they
// get their AI-written report by email like anyone who fills in the form.
// Starts from what the agent already saw and the contact they took.

export interface ReviewDraft {
  enabled: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  venueType: string;
  siteCount: string;
  consent: boolean;
  stack: Stack;
}

export function emptyReview(): ReviewDraft {
  return { enabled: false, firstName: '', lastName: '', email: '', phone: '', location: '', venueType: '', siteCount: '', consent: false, stack: {} };
}

const EMPTY: StackEntry = { tools: [], other: '', none: false, nps: {} };

/** Field venue type + ownership → the review's business type. */
function reviewType(venueType: string, ownership: string): string {
  if (venueType === 'pub' || venueType === 'bar' || venueType === 'nightclub') return 'bar';
  if (venueType === 'qsr') return 'qsr';
  if (venueType === 'hotel') return 'hotel';
  if (venueType === 'restaurant' || venueType === 'cafe') return ownership === 'group' || ownership === 'franchise' ? 'group' : 'indie';
  return '';
}

/** Pre-fill a new review from the visit: contact, town, type and the tech the agent saw. */
export function seedReview(v: {
  contact_name: string; contact_email: string; contact_phone: string; venue_type: string; ownership: string;
  address: string; postcode: string; stack: FieldStack;
}): ReviewDraft {
  const [firstName, ...rest] = v.contact_name.trim().split(/\s+/);
  const stack: Stack = {};
  for (const c of REVIEW_CATEGORIES) {
    const seen = v.stack[c.id];
    if (!seen) continue;
    // Only listed tools carry over; anything else goes in "other".
    const tools = seen.tools.filter(t => c.options.includes(t));
    const other = [...seen.tools.filter(t => !c.options.includes(t)), seen.other].filter(Boolean).join(', ');
    stack[c.id] = { tools, other, none: seen.none, nps: {} };
  }
  const town = v.address.split(',').map(s => s.trim()).filter(Boolean).pop() || v.postcode;
  return {
    enabled: true,
    firstName: firstName || '',
    lastName: rest.join(' '),
    email: v.contact_email,
    phone: v.contact_phone,
    location: town,
    venueType: reviewType(v.venue_type, v.ownership),
    siteCount: v.ownership === 'independent' ? '1' : '',
    consent: false,
    stack,
  };
}

const INPUT = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] text-ink placeholder:text-dim focus:border-ink focus:outline-none';
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted';

function summary(e: StackEntry | undefined): string {
  if (!e) return '';
  if (e.none) return 'None';
  return [...e.tools, e.other].filter(Boolean).join(', ');
}

export default function ReviewStep({ review, onChange, onStart, alreadyDone }: {
  review: ReviewDraft;
  onChange: (r: ReviewDraft) => void;
  /** Turn the review on, pre-filled from the visit. */
  onStart: () => void;
  /** This visit already has a review in the main system. */
  alreadyDone: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (alreadyDone) {
    return (
      <div className="rounded-2xl bg-positive-tint p-5 text-positive">
        <p className="text-[17px] font-bold">Intelligence Review done</p>
        <p className="mt-1 text-[14px]">It’s in the main system and their report has gone to them by email.</p>
      </div>
    );
  }

  if (!review.enabled) {
    return (
      <div>
        <h2 className="mb-1 font-display text-[28px] uppercase leading-none tracking-tight">Intelligence Review</h2>
        <p className="mb-4 text-[15px] text-muted">
          Got five minutes with the owner or GM? Run the full review with them. It goes into the main system like any other,
          and they get their Intelligence report by email.
        </p>
        <button type="button" onClick={onStart}
          className="h-14 w-full rounded-2xl bg-ink text-[16px] font-bold text-white active:bg-ink-deep">
          Start the review with them
        </button>
        <p className="mt-3 text-center text-[13px] text-muted">Optional. Skip it and just save the visit.</p>
      </div>
    );
  }

  const set = <K extends keyof ReviewDraft>(k: K, v: ReviewDraft[K]) => onChange({ ...review, [k]: v });
  const update = (id: string, fn: (e: StackEntry) => StackEntry) =>
    onChange({ ...review, stack: { ...review.stack, [id]: fn(review.stack[id] || EMPTY) } });

  const sites = Number(review.siteCount);
  const preview = review.venueType && sites >= 1 ? scoreReview(review.venueType, sites, review.stack) : null;
  const answered = REVIEW_CATEGORIES.filter(c => summary(review.stack[c.id])).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-[28px] uppercase leading-none tracking-tight">Intelligence Review</h2>
          <button type="button" onClick={() => set('enabled', false)} className="h-10 shrink-0 text-[14px] font-bold text-muted underline underline-offset-4">
            Don’t do it
          </button>
        </div>
        <p className="mt-1 text-[14px] text-muted">Ask them each one. {answered} of {REVIEW_CATEGORIES.length} answered.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <p className={LABEL + ' mb-0'}>Who’s it for</p>
        <div className="grid grid-cols-2 gap-2">
          <input className={INPUT} placeholder="First name" value={review.firstName} onChange={e => set('firstName', e.target.value)} autoComplete="off" />
          <input className={INPUT} placeholder="Last name" value={review.lastName} onChange={e => set('lastName', e.target.value)} autoComplete="off" />
        </div>
        <input className={INPUT} type="email" inputMode="email" placeholder="Email (their report goes here)" value={review.email} onChange={e => set('email', e.target.value)} autoComplete="off" />
        <input className={INPUT} type="tel" inputMode="tel" placeholder="Phone" value={review.phone} onChange={e => set('phone', e.target.value)} autoComplete="off" />
        <input className={INPUT} placeholder="Town, e.g. Camden" value={review.location} onChange={e => set('location', e.target.value)} />
        <div>
          <p className={LABEL}>Business</p>
          <div className="flex flex-wrap gap-2">
            {VENUE_TYPES.map(t => <Chip key={t.id} on={review.venueType === t.id} onClick={() => set('venueType', t.id)}>{t.label}</Chip>)}
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="sites">How many sites</label>
          <input id="sites" className={INPUT} type="number" inputMode="numeric" min={1} value={review.siteCount} onChange={e => set('siteCount', e.target.value)} placeholder="1" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {REVIEW_CATEGORIES.map(c => {
          const e = review.stack[c.id] || EMPTY;
          const isOpen = open === c.id;
          const s = summary(review.stack[c.id]);
          const rateable = [...e.tools, ...(e.other.trim() ? [e.other.trim()] : [])];
          return (
            <div key={c.id} className={`overflow-hidden rounded-2xl bg-surface ${isOpen ? 'ring-2 ring-ink' : ''}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold ${s ? 'bg-ink text-white' : 'border-2 border-border'}`}>{s ? '✓' : ''}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold">{c.label}</span>
                  <span className="block truncate text-[13px] text-muted">{s || c.hint}</span>
                </span>
                <svg className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 pt-3 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {c.options.map(o => (
                      <Chip key={o} on={e.tools.includes(o)} onClick={() => update(c.id, x => {
                        const has = x.tools.includes(o);
                        const nps = { ...x.nps };
                        if (has) delete nps[o];
                        return { ...x, none: false, tools: has ? x.tools.filter(t => t !== o) : [...x.tools, o], nps };
                      })}>{o}</Chip>
                    ))}
                  </div>
                  <input className={`${INPUT} mt-3`} value={e.other} placeholder="Something else? Type it"
                    onChange={ev => update(c.id, x => {
                      const nps = { ...x.nps };
                      const old = x.other.trim() ? otherKey(x.other) : '';
                      const score = old ? nps[old] : undefined;
                      if (old) delete nps[old];
                      if (ev.target.value.trim() && typeof score === 'number') nps[otherKey(ev.target.value)] = score;
                      return { ...x, none: false, other: ev.target.value, nps };
                    })} />
                  <div className="mt-3">
                    <Chip on={e.none} onClick={() => update(c.id, x => ({ tools: [], other: '', none: !x.none, nps: {} }))}>Don’t use anything</Chip>
                  </div>

                  {rateable.map(tool => {
                    const key = e.tools.includes(tool) ? tool : otherKey(tool);
                    const score = e.nps[key];
                    return (
                      <div key={key} className="mt-4">
                        <p className="mb-2 text-[14px]">How likely are they to recommend <b>{tool}</b>? <span className="text-muted">0–10</span></p>
                        <div className="grid grid-cols-11 gap-1">
                          {Array.from({ length: 11 }, (_, n) => (
                            <button key={n} type="button" onClick={() => update(c.id, x => ({ ...x, nps: { ...x.nps, [key]: n } }))}
                              className={`h-11 rounded-lg text-[14px] font-bold ${score === n ? 'bg-ink text-white' : 'bg-surface-2 text-ink active:bg-border'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {preview && (
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-surface p-3"><p className="font-mono text-[24px] leading-none">{preview.score}</p><p className="mt-1 text-[12px] text-muted">score</p></div>
          <div className="rounded-2xl bg-surface p-3"><p className="font-mono text-[24px] leading-none">{preview.coverage}%</p><p className="mt-1 text-[12px] text-muted">coverage</p></div>
          <div className="rounded-2xl bg-surface p-3"><p className="font-mono text-[24px] leading-none">{preview.gapCount}</p><p className="mt-1 text-[12px] text-muted">gaps</p></div>
        </section>
      )}

      <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl bg-surface p-4">
        <input type="checkbox" checked={review.consent} onChange={e => set('consent', e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[#38278F]" />
        <span className="text-[14px]"><b>They’ve said yes:</b> “{CONSENT_TEXT}”</span>
      </label>
      <p className="-mt-3 text-[13px] text-muted">When you save the visit, the review goes into the main system and their report is emailed to them.</p>
    </div>
  );
}

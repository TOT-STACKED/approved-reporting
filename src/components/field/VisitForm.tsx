'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FieldMap, { type MapPin } from './FieldMap';
import { HAS_GOOGLE } from './google-loader';
import { googleNearby } from './google-places';
import { keepPhoto, lastFix, localPhoto, rememberFix, saveOrQueue, type Fix } from '@/lib/field-outbox';
import { Chip } from './FieldChrome';
import ReviewStep, { emptyReview, seedReview, type ReviewDraft } from './ReviewStep';
import { REVIEW_CATEGORIES } from '@/lib/intelligence-review';
import {
  BUSYNESS,
  COVER_BANDS,
  DEMO_INTEREST,
  FIELD_CATEGORIES,
  FIELD_VENUE_TYPES,
  OWNERSHIP,
  fmtWhen,
  labelFor,
  stackCount,
  stackLabel,
  type FieldStack,
  type FieldStackEntry,
  type FieldVisit,
  type NearbyPlace,
} from '@/lib/field-shared';

// The whole "walk in and log it" flow, built for one hand on a phone:
//   Where — pin it (standing, map tap, search or the nearby list), name it
//   then four tiles; do any, in any order, or none:
//     Full tech review — the Intelligence Review with the operator, saved
//                        into the main system (they get their report by email)
//     Seen tech        — what you can see, category by category
//     Comments & photos — notes, and the camera straight away
//     Something else   — venue type/size/busyness, and who you spoke to
// Only Where is required; "Save" works from the tiles and every section.
//
// A new visit is kept as a draft on the phone as you go, so losing signal or
// closing the tab doesn't lose it. Photos upload as they're taken, shrunk on
// the phone first so they go up quickly on 4G.

const DRAFT_KEY = 'stacked-field-draft-v1';
type Screen = 'where' | 'hub' | 'review' | 'tech' | 'notes' | 'details';

interface Place {
  venue_name: string;
  address: string;
  postcode: string;
  osm_ref: string | null;
  /** Null until pinned: imported reviews whose location couldn't be found. */
  lat: number | null;
  lng: number | null;
  geo_precision: 'exact' | 'postcode' | 'town' | 'none';
}

interface Draft {
  visited_at: string;
  place: Place | null;
  venue_type: string;
  covers: string;
  ownership: string;
  group_name: string;
  busyness: string;
  stack: FieldStack;
  notes: string;
  photos: string[];
  contact_name: string;
  contact_role: string;
  contact_email: string;
  contact_phone: string;
  demo_interest: string;
  review: ReviewDraft;
}

function emptyDraft(): Draft {
  return {
    visited_at: new Date().toISOString(),
    place: null, venue_type: '', covers: '', ownership: '', group_name: '', busyness: '',
    stack: {}, notes: '', photos: [],
    contact_name: '', contact_role: '', contact_email: '', contact_phone: '', demo_interest: '',
    review: emptyReview(),
  };
}

function fromVisit(v: FieldVisit): Draft {
  return {
    visited_at: v.visited_at,
    place: {
      venue_name: v.venue_name, address: v.address || '', postcode: v.postcode || '', osm_ref: v.osm_ref,
      lat: v.lat, lng: v.lng, geo_precision: v.geo_precision,
    },
    venue_type: v.venue_type || '', covers: v.covers || '', ownership: v.ownership || '', group_name: v.group_name || '',
    busyness: v.busyness || '', stack: v.stack || {}, notes: v.notes || '', photos: v.photos,
    contact_name: v.contact_name || '', contact_role: v.contact_role || '', contact_email: v.contact_email || '',
    contact_phone: v.contact_phone || '', demo_interest: v.demo_interest || '',
    review: emptyReview(),
  };
}

/** Shrink a camera photo to ~1600px JPEG so it uploads fast on mobile data. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (blob) return blob;
  } catch {
    // Fall through and send the original.
  }
  return file;
}

function useGps(enabled: boolean) {
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState(() =>
    typeof navigator !== 'undefined' && !('geolocation' in navigator) ? 'This phone can’t share its location.' : '');
  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      p => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
        setPos(fix);
        setError('');
        rememberFix({ ...fix, at: Date.now() });
      },
      e => setError(e.code === e.PERMISSION_DENIED
        ? 'Location is off for this site. Turn it on in your browser settings, or drop a pin by hand.'
        : 'Still looking for GPS… you can drop a pin by hand.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { pos, error };
}

const INPUT = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] text-ink placeholder:text-dim focus:border-ink focus:outline-none';
const LABEL = 'mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted';

interface FromStop { route_id: string; stop_id: string; venue_name: string; address: string; postcode: string; lat: number; lng: number; ref: string | null }

/** A new visit started from a route stop: the venue is already chosen. */
function draftFromStop(f: FromStop): Draft {
  return {
    ...emptyDraft(),
    place: {
      venue_name: f.venue_name, address: f.address, postcode: f.postcode,
      // Only place refs carry over; "visit/<id>" refs are just route bookkeeping.
      osm_ref: f.ref && !f.ref.startsWith('visit/') ? f.ref : null,
      lat: f.lat, lng: f.lng, geo_precision: 'exact',
    },
  };
}

export default function VisitForm({ visit, photoUrls = [], fromStop }: { visit?: FieldVisit; photoUrls?: string[]; fromStop?: FromStop }) {
  const router = useRouter();
  const editing = Boolean(visit);
  const [d, setD] = useState<Draft>(() => (visit ? fromVisit(visit) : fromStop ? draftFromStop(fromStop) : emptyDraft()));
  // A visit with its venue already known (an edit, a route stop) opens on the tiles.
  const [screen, setScreen] = useState<Screen>(visit || fromStop ? 'hub' : 'where');
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { pos, error: gpsError } = useGps(true);

  // Restore an unsaved new visit, once, after hydration. Not when starting
  // from a route stop: that's a fresh visit to a chosen venue.
  useEffect(() => {
    if (editing || fromStop) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft;
      // Drafts older than 12 hours are from another day's round; drop them.
      if (Date.now() - Date.parse(saved.visited_at) > 12 * 3600 * 1000) { localStorage.removeItem(DRAFT_KEY); return; }
      if (saved.place || saved.photos.length || saved.notes) {
        setD({ ...saved, review: saved.review || emptyReview() });
        setRestored(true);
        if (saved.place?.venue_name) setScreen('hub');
      }
    } catch { /* storage blocked: carry on without drafts */ }
  }, [editing, fromStop]);

  useEffect(() => {
    if (editing) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }, [d, editing]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(prev => ({ ...prev, [k]: v }));
  const toggle = <K extends keyof Draft>(k: K, v: string) => setD(prev => ({ ...prev, [k]: prev[k] === v ? '' : v }));

  function go(to: Screen) {
    setScreen(to);
    window.scrollTo({ top: 0 });
  }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setD(emptyDraft());
    setRestored(false);
    setScreen('where');
  }

  async function save() {
    if (!d.place?.venue_name.trim()) { setError('Pick the venue first.'); go('where'); return; }
    if (d.place.lat == null && d.place.geo_precision !== 'none') { setError('Tap the map where the venue is.'); go('where'); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        ...d.place,
        visited_at: d.visited_at,
        venue_type: d.venue_type, covers: d.covers, ownership: d.ownership, group_name: d.group_name, busyness: d.busyness,
        stack: d.stack, notes: d.notes, photos: d.photos,
        contact_name: d.contact_name, contact_role: d.contact_role, contact_email: d.contact_email,
        contact_phone: d.contact_phone, demo_interest: d.demo_interest,
        review: d.review.enabled ? d.review : undefined,
        ...(fromStop ? { route_id: fromStop.route_id, stop_id: fromStop.stop_id } : {}),
        // Proof of visit: where the phone was. Only for new visits, so an edit back at the office doesn't overwrite it.
        ...(editing ? {
          gps_lat: visit!.gps_lat, gps_lng: visit!.gps_lng, gps_accuracy_m: visit!.gps_accuracy_m,
        } : pos ? { gps_lat: pos.lat, gps_lng: pos.lng, gps_accuracy_m: pos.accuracy } : {}),
      };
      if (editing) {
        const res = await fetch(`/api/field/visits/${visit!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setError(json.error || 'Couldn’t save. Try again.'); return; }
        router.replace(`/field/visits/${visit!.id}?saved=1${json.reviewError ? `&review=${encodeURIComponent(json.reviewError)}` : ''}`);
        router.refresh();
        return;
      }
      // New visits go through the phone's queue: sent now if there's signal,
      // otherwise kept (photos too) and sent automatically when it's back.
      const { id, queued, reviewError } = await saveOrQueue(d.place.venue_name, body);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      if (queued) { router.replace('/field?queued=1'); return; }
      // Saved, but the report couldn't go: show the visit and what's missing.
      if (reviewError) { router.replace(`/field/visits/${id}?saved=1&review=${encodeURIComponent(reviewError)}`); return; }
      router.replace(fromStop ? `/field/routes/${fromStop.route_id}` : `/field/visits/${id}?saved=1`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : editing
        ? 'No signal. Your changes are still on screen; save again when you’re back online.'
        : 'Couldn’t save. Your visit is kept on this phone; try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      {restored && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary-wash px-4 py-3 text-[14px]">
          <span>Carried on from your unsaved visit{d.place ? ` to ${d.place.venue_name}` : ''}.</span>
          <button type="button" onClick={discardDraft} className="shrink-0 font-bold underline underline-offset-2">Start over</button>
        </div>
      )}

      {screen !== 'where' && screen !== 'hub' && (
        <button type="button" onClick={() => go('hub')} className="mx-4 mt-3 flex h-11 items-center gap-1 text-[15px] font-bold text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          {d.place?.venue_name || 'This visit'}
        </button>
      )}

      <div className="px-4 pt-4">
        {screen === 'where' && <WhereStep d={d} set={set} pos={pos} gpsError={gpsError} editing={editing} />}
        {screen === 'hub' && <Hub d={d} reviewDone={Boolean(visit?.submission_id)} onOpen={to => {
          // Tapping the review tile means "doing the review": start it, pre-filled.
          if (to === 'review' && !d.review.enabled && !visit?.submission_id) set('review', seedReview({
            contact_name: d.contact_name, contact_email: d.contact_email, contact_phone: d.contact_phone,
            venue_type: d.venue_type, ownership: d.ownership, address: d.place?.address || '',
            postcode: d.place?.postcode || '', stack: d.stack,
          }));
          go(to);
        }} />}
        {screen === 'tech' && <TechStep stack={d.stack} onChange={s => set('stack', s)} />}
        {screen === 'notes' && <PhotoStep d={d} set={set} existingUrls={editing ? photoUrls : []} originalPhotos={visit?.photos || []} />}
        {screen === 'details' && (
          <div className="flex flex-col gap-8">
            <VenueStep d={d} set={set} toggle={toggle} />
            <ContactStep d={d} set={set} toggle={toggle} />
          </div>
        )}
        {screen === 'review' && (
          <ReviewStep
            review={d.review}
            onChange={r => set('review', r)}
            alreadyDone={Boolean(visit?.submission_id)}
            onStart={() => set('review', seedReview({
              contact_name: d.contact_name, contact_email: d.contact_email, contact_phone: d.contact_phone,
              venue_type: d.venue_type, ownership: d.ownership, address: d.place?.address || '',
              postcode: d.place?.postcode || '', stack: d.stack,
            }))}
          />
        )}
      </div>

      {error && <p role="alert" className="mx-4 mt-4 rounded-xl bg-negative-tint px-4 py-3 text-[15px] text-negative-dark">{error}</p>}

      {/* Thumb-zone action bar */}
      <div className="h-28" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex w-full max-w-md gap-2 px-4 py-3 md:max-w-2xl">
          {screen === 'where' && (
            <button type="button" disabled={!d.place?.venue_name.trim()} onClick={() => go('hub')}
              className="h-14 flex-1 rounded-2xl bg-ink text-[16px] font-bold text-white active:bg-ink-deep disabled:opacity-40">
              {!d.place ? 'Pin the venue' : !d.place.venue_name.trim() ? 'Name the venue' : 'Next: what to log'}
            </button>
          )}
          {screen !== 'where' && screen !== 'hub' && (
            <button type="button" onClick={() => go('hub')}
              className="h-14 flex-1 rounded-2xl bg-ink text-[16px] font-bold text-white active:bg-ink-deep">
              Done
            </button>
          )}
          {d.place && (
            <button type="button" disabled={saving} onClick={save}
              className={`h-14 rounded-2xl bg-primary text-[16px] font-bold uppercase tracking-tight text-white active:bg-primary-press disabled:opacity-60 ${screen === 'hub' ? 'flex-1' : 'px-5'}`}>
              {saving ? 'Saving…' : screen === 'hub' ? (d.review.enabled ? 'Save + send report' : editing ? 'Save changes' : 'Save visit') : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The tiles ────────────────────────────────────────────────────────────────

/**
 * After the venue is pinned: the visit at a glance, then four big tiles for
 * what to log. Any, in any order, or none. Each shows how far it's got.
 */
function Hub({ d, reviewDone, onOpen }: { d: Draft; reviewDone: boolean; onOpen: (s: Screen) => void }) {
  const seen = stackCount(d.stack);
  const reviewed = REVIEW_CATEGORIES.filter(c => {
    const e = d.review.stack[c.id];
    return e && (e.none || e.tools.length || e.other.trim());
  }).length;
  const details = [labelFor(FIELD_VENUE_TYPES, d.venue_type), d.contact_name].filter(Boolean).join(' · ');

  const tiles: { id: Screen; title: string; status: string; done: boolean; icon: string; lead?: boolean }[] = [
    {
      id: 'review', title: 'Full tech review', lead: true,
      done: reviewDone || (d.review.enabled && d.review.consent),
      status: reviewDone ? 'Done, report sent' : d.review.enabled ? `${reviewed} of ${REVIEW_CATEGORIES.length} answered` : 'With the owner or GM',
      icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9',
    },
    {
      id: 'tech', title: 'Seen tech', done: seen > 0,
      status: seen ? `${seen} of ${FIELD_CATEGORIES.length} spotted` : 'What you can see',
      icon: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z',
    },
    {
      id: 'notes', title: 'Comments & photos', done: d.photos.length > 0 || Boolean(d.notes.trim()),
      status: [d.photos.length ? `${d.photos.length} photo${d.photos.length === 1 ? '' : 's'}` : '', d.notes.trim() ? 'notes' : ''].filter(Boolean).join(' · ') || 'Notes and the camera',
      icon: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
    },
    {
      id: 'details', title: 'Something else', done: Boolean(details),
      status: details || 'Venue details, who you met',
      icon: 'M12 5v.01M12 12v.01M12 19v.01',
    },
  ];

  return (
    <div>
      <button type="button" onClick={() => onOpen('where')}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left active:bg-surface-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] font-bold leading-tight">{d.place?.venue_name}</span>
          <span className="block truncate text-[13px] text-muted">
            {[d.place?.address, d.place?.postcode].filter(Boolean).join(' · ') || (d.place?.geo_precision === 'none' ? 'Pin to follow' : 'Pinned on the map')} · {fmtWhen(d.visited_at)}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-bold underline underline-offset-4">Change</span>
      </button>

      <h2 className="mb-3 font-display text-[26px] uppercase leading-none tracking-tight">What are you logging?</h2>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(t => (
          <button key={t.id} type="button" onClick={() => onOpen(t.id)}
            className={`relative flex aspect-square flex-col justify-between rounded-3xl p-4 text-left md:aspect-[4/3] ${
              t.lead ? 'bg-ink text-white active:bg-ink-deep' : 'bg-surface text-ink active:bg-surface-2'}`}>
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${t.lead ? 'bg-white/15' : 'bg-surface-2'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={t.id === 'details' ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
            </span>
            {t.done && (
              <span className={`absolute top-4 right-4 grid h-7 w-7 place-items-center rounded-full text-[14px] font-bold ${t.lead ? 'bg-positive-bright text-ink' : 'bg-positive text-white'}`}>✓</span>
            )}
            <span>
              <span className="block text-[18px] font-bold leading-tight">{t.title}</span>
              <span className={`mt-1 block text-[13px] leading-snug ${t.lead ? 'text-white/75' : 'text-muted'}`}>{t.status}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-[13px] text-muted">Do any, in any order. Save whenever you’re done.</p>
    </div>
  );
}

// ── Step 1: where ────────────────────────────────────────────────────────────

type Setter = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function WhereStep({ d, set, pos, gpsError, editing }: {
  d: Draft; set: Setter; pos: { lat: number; lng: number; accuracy: number } | null; gpsError: string; editing: boolean;
}) {
  const [places, setPlaces] = useState<(NearbyPlace & { last_visit: string | null })[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [manual, setManual] = useState(false);
  const [changing, setChanging] = useState(!d.place);
  const searchedAt = useRef<{ lat: number; lng: number } | null>(null);
  const [online, setOnline] = useState(true);
  const [earlier, setEarlier] = useState<Fix | null>(null);
  // A pin dropped from "Pin where I'm standing" keeps following the phone's
  // fix while it sharpens (indoors the first fix can be hundreds of metres
  // out), until the agent taps the map or it's within 20 m. Two minutes max.
  const follow = useRef<{ accuracy: number; until: number } | null>(null);
  // Laptops have no GPS (Wi-Fi guesses); phones do. Decides the advice shown.
  const [device] = useState<'iphone' | 'android' | 'computer'>(() => {
    if (typeof navigator === 'undefined') return 'iphone';
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
    if (/Android/.test(ua)) return 'android';
    return 'computer';
  });
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ name: string; address: string; postcode: string; lat: number; lng: number; ref: string | null; known: boolean }[]>([]);
  const [finding, setFinding] = useState(false);
  const findTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search any venue or address, e.g. a site you missed and are logging later.
  function find(text: string) {
    setQ(text);
    if (findTimer.current) clearTimeout(findTimer.current);
    if (text.trim().length < 2) { setFound([]); return; }
    findTimer.current = setTimeout(async () => {
      setFinding(true);
      const at = pos || (d.place?.lat != null ? { lat: d.place.lat, lng: d.place.lng! } : null);
      const qs = new URLSearchParams({ q: text.trim(), ...(at ? { lat: String(at.lat), lng: String(at.lng) } : {}) });
      const json = await fetch(`/api/field/search?${qs}`).then(r => r.json()).catch(() => ({ results: [] }));
      setFound(json.results || []);
      setFinding(false);
    }, 350);
  }

  // Signal and the last good GPS fix (e.g. at the entrance, before going underground).
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); setEarlier(lastFix()); };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const t = setInterval(update, 30000);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); clearInterval(t); };
  }, []);

  async function search(at: { lat: number; lng: number }, radius = 150) {
    searchedAt.current = at;
    setLoading(true);
    setListError('');
    try {
      if (HAS_GOOGLE) {
        try {
          const found = await googleNearby(at.lat, at.lng, radius);
          const res = await fetch(`/api/field/nearby?refs=${encodeURIComponent(found.map(p => p.ref).join(','))}`);
          const { history = {} } = await res.json().catch(() => ({}));
          setPlaces(found.map(p => ({ ...p, last_visit: history[p.ref] ?? null })));
          return;
        } catch {
          // Places not enabled on the key, or quota: fall back to OpenStreetMap.
        }
      }
      const res = await fetch(`/api/field/nearby?lat=${at.lat}&lng=${at.lng}&r=${radius}`);
      const json = await res.json();
      setPlaces(json.places || []);
      if (json.error) setListError(json.error);
    } catch {
      setListError('No signal. Drop a pin instead.');
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }

  // First decent fix → look up what's around.
  useEffect(() => {
    if (!changing || !pos || searchedAt.current || pos.accuracy > 300) return;
    void search(pos);
  }, [pos, changing]);

  function pick(p: NearbyPlace) {
    set('place', { venue_name: p.name, address: p.address, postcode: p.postcode, osm_ref: p.ref, lat: p.lat, lng: p.lng, geo_precision: 'exact' });
    setChanging(false);
    setManual(false);
  }

  function startManual(at: { lat: number; lng: number } | null = pos || placeAt) {
    if (!at) return;
    set('place', { venue_name: d.place?.venue_name || '', address: d.place?.address || '', postcode: d.place?.postcode || '', osm_ref: null, lat: at.lat, lng: at.lng, geo_precision: 'exact' });
    setManual(true);
    setChanging(false);
  }

  useEffect(() => {
    const f = follow.current;
    if (!f || !pos || !d.place || d.place.lat == null) return;
    if (Date.now() > f.until) { follow.current = null; return; }
    if (pos.accuracy < f.accuracy) {
      set('place', { ...d.place, lat: pos.lat, lng: pos.lng, geo_precision: 'exact' });
      follow.current = pos.accuracy <= 20 ? null : { ...f, accuracy: pos.accuracy };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  /** No signal and no GPS: save the name and address now, place the pin later. */
  function pinLater() {
    set('place', { venue_name: d.place?.venue_name || '', address: d.place?.address || '', postcode: d.place?.postcode || '', osm_ref: null, lat: null, lng: null, geo_precision: 'none' });
    setManual(true);
    setChanging(false);
  }

  const mins = earlier ? Math.max(1, Math.round((Date.now() - earlier.at) / 60000)) : 0;

  const pins: MapPin[] = [];
  if (changing && places) for (const p of places) pins.push({ id: p.ref, lat: p.lat, lng: p.lng, label: p.name, tone: 'place' });
  if (d.place?.lat != null && d.place.lng != null) {
    pins.push({ id: 'selected', lat: d.place.lat, lng: d.place.lng, label: d.place.venue_name || 'Your pin', tone: 'selected' });
  }
  const placeAt = d.place?.lat != null && d.place.lng != null ? { lat: d.place.lat, lng: d.place.lng } : null;
  const offerEarlier = earlier && (!pos || pos.accuracy > 100) && !(placeAt && Math.abs(placeAt.lat - earlier.lat) < 1e-6);

  // Any pin can be moved: tap the map. Agents know better than the map.
  const canMovePin = Boolean(d.place);

  return (
    <div>
      <h2 className="mb-1 font-display text-[28px] uppercase leading-none tracking-tight">Where are you?</h2>
      <p className="mb-3 text-[14px] text-muted">
        {gpsError || (pos ? `Located to within ${pos.accuracy} m.` : 'Finding you…')}
        {d.place ? ' Tap the map to move the pin.' : ' Tap the map to drop a pin anywhere.'}
      </p>

      {/* Manual pinning, always on offer: where you're standing, anywhere on
          the map (tap it), or any venue or address by search. */}
      <div className="mb-3 flex flex-col gap-2">
        <button type="button" disabled={!pos} onClick={() => {
          startManual(pos);
          if (pos && pos.accuracy > 20) follow.current = { accuracy: pos.accuracy, until: Date.now() + 120000 };
        }}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink text-[16px] font-bold text-white active:bg-ink-deep disabled:opacity-40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          {pos ? `Pin where I’m standing · ±${pos.accuracy} m` : 'Waiting for GPS…'}
        </button>
        {pos && (pos.accuracy > 100 || device === 'computer') && (
          <div className="rounded-2xl bg-warning-tint px-4 py-3 text-[14px] text-warning-dark">
            {device === 'computer' ? (
              <>
                <p className="font-bold">Laptops don’t have GPS (this one says ±{pos.accuracy} m).</p>
                <p className="mt-1">Its location comes from Wi-Fi and can be hundreds of metres out. Search the venue below, or tap the map on the exact spot.</p>
              </>
            ) : (
              <>
                <p className="font-bold">Your phone’s location is rough (±{pos.accuracy} m).</p>
                {pos.accuracy >= 800 && device === 'iphone' && (
                  <p className="mt-1">Turn on Precise Location: Settings → Privacy &amp; Security → Location Services → Safari Websites → Precise Location. Then reopen the app.</p>
                )}
                {pos.accuracy >= 800 && device === 'android' && (
                  <p className="mt-1">Turn on precise location: Settings → Location → Location services → Google Location Accuracy. Then reopen the app.</p>
                )}
                {pos.accuracy < 800 && (
                  <p className="mt-1">It usually sharpens in a few seconds, faster near a window or door. A pin dropped now follows it; or tap the map on the exact spot.</p>
                )}
              </>
            )}
          </div>
        )}
        {online && (
          <div className="relative">
            <input className={INPUT} value={q} onChange={e => find(e.target.value)} placeholder="Or search a venue, street or postcode" autoComplete="off" enterKeyHint="search" />
            {(finding || found.length > 0) && (
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-lg">
                {finding && !found.length && <li className="px-4 py-3 text-[14px] text-muted">Searching…</li>}
                {found.slice(0, 8).map((r, i) => (
                  <li key={`${r.ref}-${i}`}>
                    <button type="button" onClick={() => {
                      set('place', {
                        venue_name: r.name, address: r.address, postcode: r.postcode,
                        osm_ref: r.ref && !r.ref.startsWith('visit/') ? r.ref : null,
                        lat: r.lat, lng: r.lng, geo_precision: 'exact',
                      });
                      setQ(''); setFound([]); setChanging(false); setManual(false);
                    }} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{r.name}</span>
                        <span className="block truncate text-[13px] text-muted">{[r.address, r.postcode].filter(Boolean).join(' · ')}</span>
                      </span>
                      {r.known && <span className="shrink-0 rounded-full bg-tag-advisory px-2 py-0.5 text-[11px] font-bold">Known</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="relative -mx-4 mb-4 overflow-hidden sm:mx-0 sm:rounded-2xl">
        {!online && (
          <p className="absolute inset-x-3 top-3 z-[500] rounded-xl bg-ink/90 px-3 py-2 text-[13px] text-white">
            No signal, so the map may be blank. Your pin still saves.
          </p>
        )}
        <FieldMap
          className="h-[38vh] min-h-64 w-full md:h-[46vh]"
          pins={pins}
          me={pos}
          center={placeAt && !changing ? placeAt : pos}
          onPinClick={id => {
            const p = places?.find(x => x.ref === id);
            if (p) pick(p);
          }}
          onMapClick={(lat, lng) => {
            // A pin already placed moves here; otherwise a new pin drops here.
            follow.current = null; // the agent has placed it themselves
            if (d.place && !changing) set('place', { ...d.place, lat, lng, geo_precision: 'exact' });
            else startManual({ lat, lng });
          }}
        />
      </div>

      {d.place && !changing && (
        <div className="mb-4 rounded-2xl border-2 border-ink bg-surface p-4">
          {manual || !d.place.osm_ref ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className={LABEL} htmlFor="venue_name">Venue name</label>
                <input id="venue_name" className={INPUT} value={d.place.venue_name} autoFocus={manual}
                  onChange={e => set('place', { ...d.place!, venue_name: e.target.value })} placeholder="e.g. The Crown" />
              </div>
              <div>
                <label className={LABEL} htmlFor="address">Address</label>
                <input id="address" className={INPUT} value={d.place.address}
                  onChange={e => set('place', { ...d.place!, address: e.target.value })} placeholder="Street, town" />
              </div>
              <div>
                <label className={LABEL} htmlFor="postcode">Postcode</label>
                <input id="postcode" className={`${INPUT} uppercase`} value={d.place.postcode} autoCapitalize="characters"
                  onChange={e => set('place', { ...d.place!, postcode: e.target.value })} placeholder="SW1A 1AA" />
              </div>
            </div>
          ) : (
            <>
              <p className="text-[19px] font-bold leading-tight">{d.place.venue_name}</p>
              <p className="text-[14px] text-muted">{[d.place.address, d.place.postcode].filter(Boolean).join(' · ') || 'Tagged on the map'}</p>
              <button type="button" onClick={() => setManual(true)} className="mt-1 h-10 text-[14px] font-bold text-ink underline underline-offset-4">
                Edit name or address
              </button>
            </>
          )}
          <VisitTime value={d.visited_at} onChange={v => set('visited_at', v)} />
          {d.place.geo_precision === 'none' ? (
            <p className="mt-2 text-[13px] font-bold text-warning-dark">
              No pin yet. Add the postcode or address and it’s placed for you when the visit sends, or tap the map if it’s showing.
            </p>
          ) : d.place.geo_precision !== 'exact' && (
            <p className="mt-2 text-[13px] text-warning-dark">This pin is approximate ({d.place.geo_precision} centre). Tap the map where the venue is.</p>
          )}
          <button type="button" onClick={() => { setChanging(true); setManual(false); if (pos && !places) void search(pos); }}
            className="mt-3 h-11 text-[15px] font-bold text-ink underline underline-offset-4">
            Change venue
          </button>
        </div>
      )}

      {changing && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className={LABEL + ' mb-0'}>Nearby</h3>
            {pos && (
              <button type="button" onClick={() => search(pos, places && places.length < 3 ? 400 : 150)} className="h-10 px-2 text-[14px] font-bold text-ink">
                {loading ? 'Looking…' : places && places.length < 3 ? 'Search wider' : 'Refresh'}
              </button>
            )}
          </div>

          {!places && !listError && pos && (
            <p className="mb-3 rounded-2xl bg-surface p-4 text-[15px] text-muted">Looking for venues around you…</p>
          )}
          {listError && <p className="mb-2 text-[14px] text-warning-dark">{listError}</p>}

          {places && places.length > 0 && (
            <ul className="mb-3 divide-y divide-border overflow-hidden rounded-2xl bg-surface">
              {places.slice(0, 12).map(p => (
                <li key={p.ref}>
                  <button type="button" onClick={() => pick(p)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-bold">{p.name}</p>
                      <p className="truncate text-[13px] text-muted">
                        {p.kind.replace('_', ' ')}{p.address ? ` · ${p.address}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[14px]">{p.distance_m} m</p>
                      {p.last_visit && <p className="text-[11px] font-bold text-positive">Visited {fmtWhen(p.last_visit).replace(/ \d\d:\d\d$/, '')}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Dead spots: underground centres, basements, no 4G. GPS needs no data,
              so a pin still works; failing that, the last place the phone knew,
              or save it now and pin it later. */}
          {(!online || listError || !pos || offerEarlier) && (
            <div className="mb-2 rounded-2xl bg-surface p-4">
              <p className="mb-1 text-[15px] font-bold">{online ? 'No GPS here?' : 'No signal? You can still log it.'}</p>
              <p className="mb-3 text-[13px] text-muted">
                {online ? 'Tap the map where the venue is, or:' : 'Your visit is saved on this phone and sends itself when you’re back online.'}
              </p>
              <div className="flex flex-col gap-2">
                {offerEarlier && earlier && (
                  <button type="button" onClick={() => startManual(earlier)}
                    className="h-12 rounded-xl bg-ink px-4 text-left text-[15px] font-bold text-white active:bg-ink-deep">
                    Pin where I was {mins} min ago
                  </button>
                )}
                <button type="button" onClick={pinLater}
                  className="h-12 rounded-xl border border-border px-4 text-left text-[15px] font-bold active:bg-surface-2">
                  Pin it later: just type the name and address
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * When the visit happened. "Now" by default; a missed site logged later can
 * be set back to when they were there (never in the future).
 */
function VisitTime({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const local = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [max] = useState(() => local(new Date().toISOString()));
  const minutesAgo = Math.round((Date.parse(max) - Date.parse(local(value))) / 60000);
  return (
    <div className="mt-3 border-t border-border pt-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center justify-between text-[14px]">
          <span className="text-muted">When you were there</span>
          <span className="font-bold underline underline-offset-4">{minutesAgo > 5 ? fmtWhen(value) : 'Now'} · change</span>
        </button>
      ) : (
        <div>
          <label className={LABEL} htmlFor="visited-at">When were you there?</label>
          <input id="visited-at" type="datetime-local" className={INPUT} max={max} value={local(value)}
            onChange={e => { if (e.target.value) onChange(new Date(e.target.value).toISOString()); }} />
        </div>
      )}
    </div>
  );
}

// ── Step 2: venue profile ────────────────────────────────────────────────────

function VenueStep({ d, set, toggle }: { d: Draft; set: Setter; toggle: (k: keyof Draft, v: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-[28px] uppercase leading-none tracking-tight">{d.place?.venue_name || 'The venue'}</h2>
      <section>
        <p className={LABEL}>Type</p>
        <div className="flex flex-wrap gap-2">
          {FIELD_VENUE_TYPES.map(t => <Chip key={t.id} on={d.venue_type === t.id} onClick={() => toggle('venue_type', t.id)}>{t.label}</Chip>)}
        </div>
      </section>
      <section>
        <p className={LABEL}>Roughly how many covers</p>
        <div className="flex flex-wrap gap-2">
          {COVER_BANDS.map(c => <Chip key={c} on={d.covers === c} onClick={() => toggle('covers', c)}>{c}</Chip>)}
        </div>
      </section>
      <section>
        <p className={LABEL}>Ownership</p>
        <div className="flex flex-wrap gap-2">
          {OWNERSHIP.map(o => <Chip key={o.id} on={d.ownership === o.id} onClick={() => toggle('ownership', o.id)}>{o.label}</Chip>)}
        </div>
        {(d.ownership === 'group' || d.ownership === 'franchise') && (
          <input className={`${INPUT} mt-3`} value={d.group_name} onChange={e => set('group_name', e.target.value)} placeholder="Which group or brand?" />
        )}
      </section>
      <section>
        <p className={LABEL}>How busy right now</p>
        <div className="flex flex-wrap gap-2">
          {BUSYNESS.map(b => <Chip key={b.id} on={d.busyness === b.id} onClick={() => toggle('busyness', b.id)}>{b.label}</Chip>)}
        </div>
      </section>
    </div>
  );
}

// ── Step 3: visible tech ─────────────────────────────────────────────────────

function summary(e: FieldStackEntry | undefined): string {
  if (!e) return '';
  if (e.none) return 'None seen';
  return [...e.tools, e.other].filter(Boolean).join(', ');
}

function TechStep({ stack, onChange }: { stack: FieldStack; onChange: (s: FieldStack) => void }) {
  const [open, setOpen] = useState<string | null>(FIELD_CATEGORIES[0].id);
  const update = (id: string, e: FieldStackEntry) => {
    const next = { ...stack };
    if (!e.tools.length && !e.other.trim() && !e.none) delete next[id];
    else next[id] = e;
    onChange(next);
  };
  // Categories carried over from an Intelligence Review that an agent can't see.
  const extra = Object.keys(stack).filter(k => !FIELD_CATEGORIES.some(c => c.id === k));

  return (
    <div>
      <h2 className="mb-1 font-display text-[28px] uppercase leading-none tracking-tight">What tech can you see?</h2>
      <p className="mb-4 text-[14px] text-muted">{stackCount(stack)} of {FIELD_CATEGORIES.length} recorded. Skip anything you can’t see.</p>
      <div className="flex flex-col gap-2">
        {FIELD_CATEGORIES.map(c => {
          const e = stack[c.id] || { tools: [], other: '', none: false };
          const isOpen = open === c.id;
          const s = summary(stack[c.id]);
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
                      <Chip key={o} on={e.tools.includes(o)} onClick={() => update(c.id, {
                        ...e, none: false, tools: e.tools.includes(o) ? e.tools.filter(t => t !== o) : [...e.tools, o],
                      })}>{o}</Chip>
                    ))}
                  </div>
                  <input
                    className={`${INPUT} mt-3`}
                    value={e.other}
                    onChange={ev => update(c.id, { ...e, none: false, other: ev.target.value })}
                    placeholder="Something else? Type it"
                  />
                  <div className="mt-3 flex gap-2">
                    <Chip on={e.none} onClick={() => update(c.id, { tools: [], other: '', none: !e.none })}>None here</Chip>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {extra.length > 0 && (
        <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-[14px]">
          <p className={LABEL}>From their Intelligence Review</p>
          {extra.map(k => <p key={k}><b>{stackLabel(k)}:</b> {summary(stack[k]) || '—'}</p>)}
        </div>
      )}
    </div>
  );
}

// ── Step 4: photos and notes ─────────────────────────────────────────────────

function PhotoStep({ d, set, existingUrls, originalPhotos }: { d: Draft; set: Setter; existingUrls: string[]; originalPhotos: string[] }) {
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    originalPhotos.forEach((p, i) => { if (existingUrls[i]) m[p] = existingUrls[i]; });
    return m;
  });
  const [uploading, setUploading] = useState(0);

  // Photos kept on the phone (taken with no signal) need their previews rebuilt after a reload.
  useEffect(() => {
    let cancelled = false;
    for (const ref of d.photos) {
      if (!ref.startsWith('local:') || previews[ref]) continue;
      localPhoto(ref).then(blob => {
        if (blob && !cancelled) setPreviews(p => ({ ...p, [ref]: URL.createObjectURL(blob) }));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.photos]);
  const [err, setErr] = useState('');
  const photosRef = useRef(d.photos);
  photosRef.current = d.photos;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setErr('');
    const list = Array.from(files).slice(0, 12 - d.photos.length);
    setUploading(n => n + list.length);
    for (const file of list) {
      try {
        const blob = await shrink(file);
        let ref: string;
        try {
          const form = new FormData();
          form.append('photo', blob, 'photo.jpg');
          const res = await fetch('/api/field/photos', { method: 'POST', body: form });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.path) throw new Error(json.error || 'Upload failed');
          ref = json.path;
        } catch (e) {
          // No signal: keep it on the phone; it uploads when the visit sends.
          if (!(e instanceof TypeError)) throw e;
          ref = await keepPhoto(blob);
        }
        setPreviews(p => ({ ...p, [ref]: URL.createObjectURL(blob) }));
        photosRef.current = [...photosRef.current, ref];
        set('photos', photosRef.current);
      } catch (e) {
        setErr(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'A photo didn’t save. Try adding it again.');
      } finally {
        setUploading(n => n - 1);
      }
    }
    if (input.current) input.current.value = '';
    if (gallery.current) gallery.current.value = '';
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-1 font-display text-[28px] uppercase leading-none tracking-tight">Photos</h2>
        <p className="mb-3 text-[14px] text-muted">The till, card machines, QR codes, kiosks, the shopfront.</p>
        {/* Two pickers: the camera, or photos already on the phone (taken earlier, or sent by the venue). */}
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => add(e.target.files)} />
        <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={e => add(e.target.files)} />
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
          {d.photos.map(p => (
            <div key={p} className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
              {previews[p] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[p]} alt="" className="h-full w-full object-cover" />
              ) : <span className="grid h-full place-items-center text-xs text-muted">Saved</span>}
              {p.startsWith('local:') && <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">On phone</span>}
              <button type="button" aria-label="Remove photo" onClick={() => set('photos', d.photos.filter(x => x !== p))}
                className="absolute top-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">×</button>
            </div>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`u${i}`} className="grid aspect-square animate-pulse place-items-center rounded-xl bg-surface-2 text-xs text-muted">Uploading…</div>
          ))}
          {d.photos.length + uploading < 12 && (
            <>
              <button type="button" onClick={() => input.current?.click()}
                className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-ink/40 bg-surface text-ink active:bg-surface-2">
                <span className="flex flex-col items-center gap-1 text-[13px] font-bold">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  Take photo
                </span>
              </button>
              <button type="button" onClick={() => gallery.current?.click()}
                className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-ink/40 bg-surface text-ink active:bg-surface-2">
                <span className="flex flex-col items-center gap-1 text-[13px] font-bold">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  From gallery
                </span>
              </button>
            </>
          )}
        </div>
        {err && <p className="mt-2 text-[14px] text-negative">{err}</p>}
      </section>
      <section>
        <label className={LABEL} htmlFor="notes">Notes</label>
        <textarea id="notes" rows={5} value={d.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Anything worth knowing: pain points, what staff said, refit coming up…"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[16px] placeholder:text-dim focus:border-ink focus:outline-none" />
      </section>
    </div>
  );
}

// ── Step 5: contact ──────────────────────────────────────────────────────────

function ContactStep({ d, set, toggle }: { d: Draft; set: Setter; toggle: (k: keyof Draft, v: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-1 font-display text-[28px] uppercase leading-none tracking-tight">Who did you speak to?</h2>
        <p className="text-[14px] text-muted">Optional. Kept internal, never shared with partners.</p>
      </div>
      <div>
        <label className={LABEL} htmlFor="cn">Name</label>
        <input id="cn" className={INPUT} value={d.contact_name} onChange={e => set('contact_name', e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className={LABEL} htmlFor="cr">Role</label>
        <input id="cr" className={INPUT} value={d.contact_role} onChange={e => set('contact_role', e.target.value)} placeholder="GM, owner, ops manager…" />
      </div>
      <div>
        <label className={LABEL} htmlFor="ce">Email</label>
        <input id="ce" type="email" inputMode="email" className={INPUT} value={d.contact_email} onChange={e => set('contact_email', e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className={LABEL} htmlFor="cp">Phone</label>
        <input id="cp" type="tel" inputMode="tel" className={INPUT} value={d.contact_phone} onChange={e => set('contact_phone', e.target.value)} autoComplete="off" />
      </div>
      <div>
        <p className={LABEL}>Up for a demo or a chat?</p>
        <div className="flex gap-2">
          {DEMO_INTEREST.map(o => <Chip key={o.id} on={d.demo_interest === o.id} onClick={() => toggle('demo_interest', o.id)}>{o.label}</Chip>)}
        </div>
      </div>
    </div>
  );
}

// Stacked Field's offline queue, on the phone (browser only).
//
// Underground or in a dead spot, a visit can't reach the server. It's kept
// here instead, photos and all, in IndexedDB (which survives the app being
// closed), and sent the next time there's signal: when the phone comes back
// online, when the app opens, and every 30 s while anything is waiting.
//
// Photos taken offline are stored as blobs and referred to as "local:<id>" in
// the visit; on sending, each is uploaded first and swapped for its server
// path. A visit is only removed from the queue once the server has it. If a
// send drops mid-way, the server recognises the resend by agent, start time
// and venue, and returns the visit it already saved, so nothing is doubled.

const DB = 'stacked-field';
const VISITS = 'outbox';
const PHOTOS = 'photos';
const EVENT = 'stacked-field-outbox';

export interface QueuedVisit {
  id: string;
  queued_at: string;
  venue_name: string;
  body: Record<string, unknown>;
  /** Last failure, shown to the agent. */
  error?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VISITS)) db.createObjectStore(VISITS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

function changed() {
  window.dispatchEvent(new Event(EVENT));
}

/** Call `fn` whenever the queue changes. Returns an unsubscribe. */
export function onOutboxChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

// ── Photos ───────────────────────────────────────────────────────────────────

export const isLocalPhoto = (ref: string) => ref.startsWith('local:');

export async function keepPhoto(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  await tx(PHOTOS, 'readwrite', s => s.put(blob, id));
  return `local:${id}`;
}

export async function localPhoto(ref: string): Promise<Blob | null> {
  if (!isLocalPhoto(ref)) return null;
  return ((await tx<Blob>(PHOTOS, 'readonly', s => s.get(ref.slice(6)))) as Blob | undefined) || null;
}

async function dropPhoto(ref: string) {
  await tx(PHOTOS, 'readwrite', s => s.delete(ref.slice(6)));
}

// ── Visits ───────────────────────────────────────────────────────────────────

export async function queueVisit(venueName: string, body: Record<string, unknown>): Promise<QueuedVisit> {
  const item: QueuedVisit = { id: crypto.randomUUID(), queued_at: new Date().toISOString(), venue_name: venueName, body };
  await tx(VISITS, 'readwrite', s => s.put(item));
  changed();
  return item;
}

export async function queuedVisits(): Promise<QueuedVisit[]> {
  try {
    return ((await tx<QueuedVisit[]>(VISITS, 'readonly', s => s.getAll())) || []).sort((a, b) => a.queued_at.localeCompare(b.queued_at));
  } catch {
    return [];
  }
}

export class NotSignedInError extends Error {}

interface Sent { id: string; reviewError: string | null }

/** Send one queued visit: its offline photos first, then the visit. Returns the server's visit id. */
async function sendOne(item: QueuedVisit): Promise<Sent> {
  const photos = Array.isArray(item.body.photos) ? (item.body.photos as string[]) : [];
  const sent: string[] = [];
  for (const ref of photos) {
    if (!isLocalPhoto(ref)) { sent.push(ref); continue; }
    const blob = await localPhoto(ref);
    if (!blob) continue;
    const form = new FormData();
    form.append('photo', blob, 'photo.jpg');
    const res = await fetch('/api/field/photos', { method: 'POST', body: form });
    if (res.status === 401) throw new NotSignedInError();
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.path) throw new Error(json.error || 'A photo didn’t upload');
    sent.push(json.path);
    // Remember the swap, so a retry doesn't upload this photo again.
    item.body.photos = [...sent, ...photos.slice(sent.length)];
    await tx(VISITS, 'readwrite', s => s.put(item));
  }
  const res = await fetch('/api/field/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item.body, photos: sent }),
  });
  if (res.status === 401) throw new NotSignedInError();
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server read it and said no (e.g. a half-filled review): say why, keep it.
    throw new Error(json.error || 'The server didn’t accept it');
  }
  return { id: json.id as string, reviewError: (json.reviewError as string) || null };
}

let flushing: Promise<{ sent: number; left: number }> | null = null;

/**
 * Try to send everything waiting. Safe to call often: one run at a time.
 * Stops at the first network failure (no point hammering a dead connection).
 */
export function flushOutbox(): Promise<{ sent: number; left: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    const items = await queuedVisits();
    for (const item of items) {
      try {
        await sendOne(item);
        for (const ref of (item.body.photos as string[] | undefined) || []) if (isLocalPhoto(ref)) await dropPhoto(ref).catch(() => {});
        await tx(VISITS, 'readwrite', s => s.delete(item.id));
        sent++;
        changed();
      } catch (e) {
        if (e instanceof TypeError) break; // fetch failed: still no signal
        item.error = e instanceof NotSignedInError ? 'Sign in again to send this' : e instanceof Error ? e.message : 'Couldn’t send';
        await tx(VISITS, 'readwrite', s => s.put(item)).catch(() => {});
        changed();
        if (e instanceof NotSignedInError) break;
      }
    }
    const left = (await queuedVisits()).length;
    return { sent, left };
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Send one visit now if possible; otherwise it waits in the queue. */
export async function saveOrQueue(venueName: string, body: Record<string, unknown>): Promise<{ id: string | null; queued: boolean; reviewError?: string | null }> {
  const item = await queueVisit(venueName, body);
  try {
    const { id, reviewError } = await sendOne(item);
    for (const ref of (item.body.photos as string[] | undefined) || []) if (isLocalPhoto(ref)) await dropPhoto(ref).catch(() => {});
    await tx(VISITS, 'readwrite', s => s.delete(item.id));
    changed();
    return { id, queued: false, reviewError };
  } catch (e) {
    if (e instanceof TypeError) return { id: null, queued: true }; // no signal: it waits
    // A real refusal: take it back out of the queue and show the reason.
    await tx(VISITS, 'readwrite', s => s.delete(item.id)).catch(() => {});
    changed();
    throw e;
  }
}

// ── Last known position ─────────────────────────────────────────────────────

const LAST_FIX = 'stacked-field-last-fix';

export interface Fix { lat: number; lng: number; accuracy: number; at: number }

/** Keep the phone's latest good GPS fix, so a pin can be dropped where it last was (e.g. the entrance, before going underground). */
export function rememberFix(f: Fix) {
  if (f.accuracy > 150) return;
  try { localStorage.setItem(LAST_FIX, JSON.stringify(f)); } catch { /* ignore */ }
}

export function lastFix(maxAgeMs = 2 * 60 * 60 * 1000): Fix | null {
  try {
    const f = JSON.parse(localStorage.getItem(LAST_FIX) || 'null') as Fix | null;
    return f && Date.now() - f.at < maxAgeMs ? f : null;
  } catch {
    return null;
  }
}

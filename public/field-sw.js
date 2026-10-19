// Stacked Field service worker: lets the app open and log a visit with no
// signal (underground centres, basements, dead spots).
//
//   pages under /field      network first; with no signal, the copy saved last
//                           time it loaded (New visit and home are kept warm)
//   /_next/static, fonts    cache first: file names change on every deploy,
//                           so a cached copy is never stale
//   map tiles               cache first, so areas already seen still draw
//   /api/*                  never cached: visits wait in the app's own queue
//
// Scope is /field only; the rest of the portal is untouched.

const VERSION = 'field-v1';
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const TILES = `${VERSION}-tiles`;
const WARM = ['/field', '/field/visit'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const isTile = url => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) || url.hostname.endsWith('.googleapis.com') && url.pathname.includes('/vt');

async function pageFromNetwork(request) {
  const res = await Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 6000)),
  ]);
  // Only keep real pages: a redirect to sign-in is not "the visit page".
  if (res.ok && !res.redirected && res.type === 'basic') {
    const copy = res.clone();
    caches.open(PAGES).then(c => c.put(new URL(request.url).pathname, copy)).catch(() => {});
  }
  return res;
}

async function pageFromCache(request) {
  const path = new URL(request.url).pathname;
  const cache = await caches.open(PAGES);
  return (await cache.match(path))
    // Anything else offline (a route, a visit) → New visit, which works offline.
    || (await cache.match('/field/visit'))
    || new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stacked Field</title>' +
      '<body style="margin:0;font-family:system-ui;background:#38278F;color:#fff;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">' +
      '<div><h1 style="font-size:22px">No signal</h1><p>Open Stacked Field once with signal so it can work offline.</p>' +
      '<p><a style="color:#fff" href="/field">Try again</a></p></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/field')) {
    event.respondWith(pageFromNetwork(request).catch(() => pageFromCache(request)));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(ASSETS).then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    }));
    return;
  }

  if (isTile(url)) {
    event.respondWith(caches.open(TILES).then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    }));
  }
});

// The app asks for its offline pages to be kept fresh while there's signal:
// fetch each, keep it, and keep every script and stylesheet it loads.
self.addEventListener('message', event => {
  if (event.data?.type !== 'warm') return;
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    const assets = await caches.open(ASSETS);
    for (const path of WARM) {
      try {
        const res = await fetch(path, { credentials: 'same-origin' });
        if (!res.ok || res.redirected) continue;
        const html = await res.clone().text();
        await pages.put(path, res);
        const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
        await Promise.all(urls.map(async u => {
          if (await assets.match(u)) return;
          const r = await fetch(u).catch(() => null);
          if (r && r.ok) await assets.put(u, r);
        }));
      } catch {
        // No signal right now: try again next time.
      }
    }
  })());
});

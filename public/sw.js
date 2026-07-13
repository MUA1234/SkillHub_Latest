/**
 * SkillHub service worker — Web Push receiver (Phase F3) + PWA shell
 * cache (Phase J2).
 *
 * Cache strategy is intentionally conservative:
 *
 *   - **Same-origin static assets** (Next.js `/_next/static/*`, images,
 *     fonts): cache-first with a stale fallback. These are content-hashed
 *     by Next so a stale cache entry is always correct.
 *   - **Navigation requests** (HTML): network-first with a cached
 *     fallback to `/offline.html`. We never serve a stale HTML page from
 *     cache because it'd reference stale JS chunks.
 *   - **API requests** (`/api/v1/*`): always network. We deliberately do
 *     not cache API responses — auth state + write-after-read coherence
 *     are more important than offline reads, and Phase J3 will be where
 *     genuine offline data lands.
 *
 * Payload shape for push (set by backend services/push_service.py):
 *   { title, body, url, tag, icon }
 */

const CACHE_VERSION = 'skillhub-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Files we pre-cache on install. Kept minimal so the install doesn't
// stall on a slow connection. The full app shell is filled in lazily as
// the user navigates.
const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  // Activate this worker immediately on install rather than waiting for the
  // next page load. Updates ship faster and the user doesn't lose pushes
  // while a previous worker still runs.
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort: a 404 on /offline.html during dev shouldn't block
      // the install entirely.
      await Promise.all(
        SHELL_URLS.map((u) =>
          cache.add(u).catch(() => {
            /* tolerate */
          }),
        ),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  // Take control of every open SkillHub tab so a freshly-installed worker
  // starts receiving pushes for sessions opened before the install.
  event.waitUntil(
    (async () => {
      // Drop any cache from a previous SW version so we don't pile up
      // stale shells across deploys.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Fetch handler — runtime caching for the three classes above.
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Skip cross-origin (CDN images, Supabase, etc.). Browser cache handles
  // those; reaching in here adds bug surface without much win.
  if (url.origin !== self.location.origin) return;

  // Never cache API. Phase J3 is where offline data semantics land.
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/images/') ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Navigation (HTML): network-first, fall back to /offline.html.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match('/offline.html');
          return offline || new Response('You appear to be offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })(),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      // Some push services deliver text/plain — fall back to a generic
      // notification rather than dropping it.
      data = { title: 'SkillHub', body: event.data.text() };
    }
  }
  const title = data.title || 'SkillHub';
  const options = {
    body: data.body || '',
    icon: data.icon || '/images/logo.png',
    badge: '/images/logo.png',
    // `tag` lets a fresh notification with the same tag replace an older
    // one — e.g. multiple "scholarship_match" pushes collapse into the
    // most recent rather than stacking.
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // If a SkillHub tab is already open, focus it and route there rather
      // than opening a fresh window. Most users prefer this over a tab pile.
      for (const client of all) {
        if ('focus' in client) {
          try {
            await client.focus();
            if ('navigate' in client) {
              await client.navigate(targetUrl);
            }
            return;
          } catch {
            // Some browsers throw on cross-origin navigate; fall through to
            // openWindow.
          }
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

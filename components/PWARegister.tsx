'use client';

/**
 * Phase J2 — Service worker auto-registration.
 *
 * The push pipeline registers the SW only when the user opts into push.
 * For the PWA shell cache + offline page we want the SW registered on
 * every load. This component mounts once from the root layout and
 * silently registers `/sw.js`.
 *
 * Skipped in dev (`process.env.NODE_ENV !== 'production'`) so HMR's
 * `_next` chunks aren't snapshotted into the cache between rebuilds —
 * a SW caching stale dev chunks is the worst kind of bug.
 */

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
    });
  }, []);
  return null;
}

export default PWARegister;

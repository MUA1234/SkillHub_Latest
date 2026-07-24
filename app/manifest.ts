/**
 * Phase J2 — PWA manifest.
 *
 * Next.js App Router serves this file at `/manifest.webmanifest` when
 * exported as the `manifest` route. Mobile browsers consume the same
 * file to surface the "Install app" prompt.
 *
 * Icons use the dedicated SkillHub app mark (the reading figure on a stack
 * of books) at 192/512 in /public, so the install prompt gets crisp,
 * correctly-sized assets and Lighthouse no longer flags missing sizes.
 * The 512 entry is also marked `maskable` for adaptive Android icons.
 */

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SkillHub Sri Lanka',
    short_name: 'SkillHub',
    description:
      'Inclusive education for Sri Lankan students. Live lessons, courses, and accessibility-first learning.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF1DD',
    theme_color: '#E97A3C',
    lang: 'en',
    categories: ['education', 'productivity'],
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

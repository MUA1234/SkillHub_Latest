/**
 * Phase J2 — PWA manifest.
 *
 * Next.js App Router serves this file at `/manifest.webmanifest` when
 * exported as the `manifest` route. Mobile browsers consume the same
 * file to surface the "Install app" prompt.
 *
 * Icons reference `/skillhub-logo.png` (the leafy brand mark sitting in
 * /public). It is a single-resolution asset; Lighthouse flags the missing
 * 192/512 sizes as a warning but the install prompt still appears. When
 * dedicated PWA icon sizes land, swap them in here without touching the
 * SW or page registration.
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
        src: '/skillhub-logo.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

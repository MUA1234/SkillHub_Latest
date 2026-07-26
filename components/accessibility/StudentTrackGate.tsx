'use client';

/**
 * StudentTrackGate — the post-login "strong separation" for students.
 *
 * Mounted once from app/students/layout.tsx, so it wraps EVERY /students/**
 * route. It reads the signed-in user's `accessibility_track` and keeps each
 * student inside their own space:
 *
 *   • a Visual / Hearing student who lands on the normal dashboard (or the
 *     wrong track's pages) is sent to their own track home;
 *   • a normal student who lands on a track dashboard is sent back to /students/dashboard;
 *   • a track student who opens a generic page that has a tailored equivalent
 *     (content library, find-teachers) is rerouted to their track version.
 *
 * Shared utility pages (settings, live sessions, recordings, chat, meetings,
 * payments, certificates, progress, guardians) stay open to everyone.
 *
 * The gate renders a small, screen-reader-friendly loader while it decides or
 * while a redirect is in flight, so a student never sees a flash of the wrong
 * dashboard.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import {
  Track,
  trackHome,
  requiredTrackForStudentPath,
  trackEquivalentForPath,
} from '@/lib/accessibility-tracks';

/** Decide where (if anywhere) this student must be sent from `path`. */
function resolveRedirect(
  path: string,
  role: string | undefined,
  track: Track | null,
): string | null {
  // Role not known yet (token present but user object not hydrated) — don't
  // bounce; let the page's own guard decide once the user loads.
  if (!role) return null;
  // A known non-student never belongs under /students/** — send to sign in.
  if (role !== 'student') return '/auth';

  const reserved = requiredTrackForStudentPath(path);

  // Reserved-route enforcement (the hard wall between spaces).
  if (reserved === 'normal' && track) {
    return trackHome(track);
  }
  if ((reserved === 'visual' || reserved === 'hearing') && track !== reserved) {
    return track ? trackHome(track) : '/students/dashboard';
  }

  // A track student on a generic page with a tailored equivalent → their version.
  if (track) {
    const equivalent = trackEquivalentForPath(path, track);
    if (equivalent) return equivalent;
  }

  return null;
}

export default function StudentTrackGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/auth');
      return;
    }
    const user = getCurrentUser() as
      | { role?: string; accessibility_track?: Track | null }
      | null;
    const role = user?.role;
    const track = (user?.accessibility_track as Track | null) ?? null;

    const target = resolveRedirect(pathname, role, track);
    if (target && target !== pathname) {
      setReady(false);
      router.replace(target);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return (
      <div
        className="min-h-screen bg-cream-100 grid place-items-center"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-espresso/15 border-t-terracotta animate-spin" />
          <p className="text-sm font-semibold text-espresso/70">Taking you to your space…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

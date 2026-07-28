'use client';

/**
 * The specialist dashboard was merged into the single teacher dashboard, whose
 * General / Visual / Hearing switch now selects the specialist context. This
 * route just forwards there so old links / bookmarks keep working.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { writeStoredMode } from '@/lib/teaching-mode';

export default function SpecialistDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Nudge the switch toward a specialist context on arrival.
    try {
      const raw = localStorage.getItem('current_user');
      const tracks = raw ? JSON.parse(raw)?.teaching_tracks : null;
      if (Array.isArray(tracks) && tracks.includes('visual')) writeStoredMode('visual');
      else if (Array.isArray(tracks) && tracks.includes('hearing')) writeStoredMode('hearing');
    } catch { /* ignore */ }
    router.replace('/teachers/dashboard');
  }, [router]);
  return null;
}

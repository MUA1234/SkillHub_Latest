'use client';

/**
 * A small, always-visible pill that tells a differently-abled student which
 * space they're in ("Visual track" / "Hearing track"). Rendered in the top
 * navigation so the strong separation is legible on every page. Renders
 * nothing for normal students (or before the user is known).
 */

import { useEffect, useState } from 'react';
import { Eye, Ear } from 'lucide-react';
import { getCurrentUser } from '@/lib/api';
import { Track, trackTheme } from '@/lib/accessibility-tracks';

const ACCENT_PILL: Record<'forest' | 'coral', string> = {
  forest: 'bg-forest/15 text-forest border-forest/30',
  coral: 'bg-coral/15 text-coral border-coral/40',
};

export function TrackBadge({ className = '' }: { className?: string }) {
  const [track, setTrack] = useState<Track | null>(null);

  useEffect(() => {
    try {
      const user = getCurrentUser() as { accessibility_track?: Track | null } | null;
      const t = user?.accessibility_track;
      if (t === 'visual' || t === 'hearing') setTrack(t);
    } catch {
      /* ignore */
    }
  }, []);

  if (!track) return null;

  const theme = trackTheme(track);
  const Icon = track === 'visual' ? Eye : Ear;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold tracking-wide ${ACCENT_PILL[theme.accent]} ${className}`}
      title={`${theme.badge} · ${theme.tagline}`}
      aria-label={`You are in the ${theme.label} accessibility track`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {theme.badge}
    </span>
  );
}

export default TrackBadge;

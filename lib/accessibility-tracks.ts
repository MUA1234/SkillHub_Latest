/**
 * Accessibility Tracks — the coarse grouping that drives dashboard routing and
 * the teacher↔student data wall.
 *
 * Only two tracks exist in this phase: `visual` and `hearing`. Any other
 * disability leaves the student on the normal dashboard (adaptations still
 * apply via AdaptiveAccessibilityContext).
 *
 * IMPORTANT: two DisabilityType vocabularies flow through the app —
 *   - lib/disability-assessment.ts (coarse): 'visual_impairment', 'hearing_impairment',
 *     'color_vision_deficiency', ...
 *   - lib/accessibility-types.ts (granular): 'visual_impairment_low_vision',
 *     'visual_impairment_blind', 'hearing_impairment_deaf', 'color_vision_protanopia', ...
 * Prefix matching below covers BOTH, so callers can pass either.
 */

export type Track = 'visual' | 'hearing';

export const TRACKS: Track[] = ['visual', 'hearing'];

/** Map a single disability type (either vocabulary) to a track, or null. */
export function trackForDisability(type: string | null | undefined): Track | null {
  if (!type) return null;
  const t = String(type).toLowerCase();
  if (t.startsWith('visual_impairment') || t.startsWith('color_vision')) return 'visual';
  if (t.startsWith('hearing_impairment')) return 'hearing';
  return null;
}

/** All tracks a set of disability types belongs to (deduped, stable order). */
export function tracksForDisabilities(types: Array<string | null | undefined> | null | undefined): Track[] {
  if (!types || types.length === 0) return [];
  const found = new Set<Track>();
  for (const t of types) {
    const track = trackForDisability(t);
    if (track) found.add(track);
  }
  return TRACKS.filter((tr) => found.has(tr));
}

/**
 * The student's primary track — decides which dashboard they land on.
 * Prefers the explicit primary disability; otherwise the first matching track
 * among all disability types; otherwise null (→ normal dashboard).
 */
export function primaryTrack(
  disabilityTypes: Array<string | null | undefined> | null | undefined,
  primaryDisability?: string | null,
): Track | null {
  const fromPrimary = trackForDisability(primaryDisability);
  if (fromPrimary) return fromPrimary;
  const all = tracksForDisabilities(disabilityTypes);
  return all[0] ?? null;
}

/** Route a student to their landing dashboard based on their primary track. */
export function trackHome(track: Track | null | undefined): string {
  switch (track) {
    case 'visual':
      return '/students/visual/dashboard';
    case 'hearing':
      return '/students/hearing/dashboard';
    default:
      return '/students/dashboard';
  }
}

/** The teacher specialist dashboard (any teacher with teaching_tracks lands here). */
export function teacherHome(teachingTracks: Track[] | string[] | null | undefined): string {
  return teachingTracks && teachingTracks.length > 0
    ? '/teachers/specialist/dashboard'
    : '/teachers/dashboard';
}

/** Do a teacher's tracks overlap a student's tracks? (the hard-wall predicate) */
export function tracksOverlap(a: Array<string> | null | undefined, b: Array<string> | null | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const setB = new Set(b);
  return a.some((x) => setB.has(x));
}

const TRACK_LABELS: Record<Track, string> = {
  visual: 'Visual',
  hearing: 'Hearing',
};

export function trackLabel(track: Track): string {
  return TRACK_LABELS[track] ?? track;
}

/**
 * Per-track visual identity — drives the persistent badge, the dashboard accent
 * and the curated navigation so a differently-abled student always sees, at a
 * glance, which space they're in. Accents use existing design-system tokens
 * (`forest`, `coral`) so they read as distinct from the normal student's
 * `terracotta` theme.
 */
export interface TrackTheme {
  /** Short label, e.g. "Visual". */
  label: string;
  /** Badge text, e.g. "Visual track". */
  badge: string;
  /** One-line promise of the track, e.g. "Audio-first". */
  tagline: string;
  /** Design-system color token for this track's accent. */
  accent: 'forest' | 'coral';
}

export const TRACK_THEME: Record<Track, TrackTheme> = {
  visual: { label: 'Visual', badge: 'Visual track', tagline: 'Audio-first learning', accent: 'forest' },
  hearing: { label: 'Hearing', badge: 'Hearing track', tagline: 'Captioned & signed', accent: 'coral' },
};

export function trackTheme(track: Track): TrackTheme {
  return TRACK_THEME[track];
}

/** The track a differently-abled student's own library page lives at. */
export function trackLibraryHref(track: Track): string {
  return `/students/${track}/library`;
}

/** The track a differently-abled student's specialist-matching page lives at. */
export function trackSpecialistHref(track: Track): string {
  return `/students/${track}/find-specialist`;
}

/**
 * Which track a given `/students/**` path is reserved for:
 *   'visual' | 'hearing' → only that track's students may see it
 *   'normal'             → only students with NO track (the generic dashboard)
 *   null                 → shared: any authenticated student may see it
 *
 * This is the core of the post-login "strong separation": the layout-level
 * gate uses it to keep each student inside their own space.
 */
export function requiredTrackForStudentPath(path: string): Track | 'normal' | null {
  if (path.startsWith('/students/visual')) return 'visual';
  if (path.startsWith('/students/hearing')) return 'hearing';
  if (path === '/students/dashboard') return 'normal';
  return null;
}

/**
 * For a student who IS in a track, the track-specific page a generic page
 * should be rerouted to (so they use their tailored library / specialist
 * finder instead of the normal-student equivalents). Returns null when the
 * path has no track-specific equivalent.
 */
export function trackEquivalentForPath(path: string, track: Track): string | null {
  if (path === '/students/content-library') return trackLibraryHref(track);
  if (
    path === '/students/network/find-teachers' ||
    path.startsWith('/students/network/find-teachers/') ||
    path === '/students/find-teachers' ||
    path.startsWith('/students/find-teachers/')
  ) {
    return trackSpecialistHref(track);
  }
  return null;
}

/** Representative disability types stored for a teacher who teaches a track.
 *  The backend derives teaching_tracks from these, and existing
 *  teachers-by-specialization discovery keeps working. */
export function disabilityTypesForTrack(track: Track): string[] {
  switch (track) {
    case 'visual':
      return ['visual_impairment_low_vision', 'visual_impairment_blind', 'color_vision_deficiency'];
    case 'hearing':
      return ['hearing_impairment_deaf', 'hearing_impairment_hard_of_hearing'];
    default:
      return [];
  }
}

/** The TeacherSpecializationType that matches a track. */
export function specializationForTrack(track: Track): string {
  return track === 'visual' ? 'visual_impairment_specialist' : 'hearing_impairment_specialist';
}

/** Central role+track → landing dashboard router, used by the login redirect
 *  and the authenticated landing page. */
export function homeForUser(
  user:
    | { role?: string; accessibility_track?: string | null; teaching_tracks?: string[] | null }
    | null
    | undefined,
): string {
  if (!user) return '/auth';
  switch (user.role) {
    case 'student':
      return trackHome((user.accessibility_track as Track) ?? null);
    case 'teacher':
      return teacherHome(user.teaching_tracks ?? null);
    case 'sponsor':
      return '/sponsors/dashboard';
    case 'guardian':
      return '/guardian/dashboard';
    case 'admin':
      return '/admin/dashboard';
    default:
      return '/students/dashboard';
  }
}

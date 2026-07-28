/**
 * Teaching mode — the single teacher dashboard's "which students am I working
 * with right now" switch. One teacher, three contexts:
 *
 *   general → normal students; uploads accept anything.
 *   visual  → blind / low-vision students; uploads accept AUDIO only (audiobooks),
 *             and the content is tagged so it surfaces in the Visual voice library.
 *   hearing → deaf / hard-of-hearing students; uploads accept VIDEO only
 *             (captioned / signed), tagged for the Hearing library.
 *
 * The mode is a client-side authoring context (persisted in localStorage). It
 * decides how the upload form behaves and which accessibility_track the backend
 * tags new content with. See TeachingModeContext + the content upload page.
 */

export type TeachingMode = 'general' | 'visual' | 'hearing';

export const TEACHING_MODES: TeachingMode[] = ['general', 'visual', 'hearing'];

export interface TeachingModeConfig {
  mode: TeachingMode;
  label: string;
  short: string;
  /** Who this mode teaches. */
  audience: string;
  /** One-line description of the upload rule. */
  uploadRule: string;
  /** HTML file-input accept string; '' means no restriction. */
  accept: string;
  /** The content_type forced for uploads in this mode ('' = auto-detect). */
  forcedContentType: '' | 'audio' | 'video';
  /** The accessibility_track sent to the backend ('' for general). */
  track: '' | 'visual' | 'hearing';
  /** Design-system accent token. */
  accent: 'terracotta' | 'forest' | 'coral';
}

export const TEACHING_MODE_CONFIG: Record<TeachingMode, TeachingModeConfig> = {
  general: {
    mode: 'general',
    label: 'General students',
    short: 'General',
    audience: 'Standard learners',
    uploadRule: 'Upload any lesson type — documents, video, audio or images.',
    accept: '',
    forcedContentType: '',
    track: '',
    accent: 'terracotta',
  },
  visual: {
    mode: 'visual',
    label: 'Visually impaired students',
    short: 'Visual (audio)',
    audience: 'Blind & low-vision learners',
    uploadRule: 'Audio only — these students learn by listening, so upload audiobooks and narrated lessons.',
    accept: 'audio/*',
    forcedContentType: 'audio',
    track: 'visual',
    accent: 'forest',
  },
  hearing: {
    mode: 'hearing',
    label: 'Hearing impaired students',
    short: 'Hearing (video)',
    audience: 'Deaf & hard-of-hearing learners',
    uploadRule: 'Video only — upload captioned or sign-language video these students can follow visually.',
    accept: 'video/*',
    forcedContentType: 'video',
    track: 'hearing',
    accent: 'coral',
  },
};

export function teachingModeConfig(mode: TeachingMode): TeachingModeConfig {
  return TEACHING_MODE_CONFIG[mode] ?? TEACHING_MODE_CONFIG.general;
}

const STORAGE_KEY = 'skillhub_teaching_mode';

export function readStoredMode(): TeachingMode | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'general' || v === 'visual' || v === 'hearing' ? v : null;
}

export function writeStoredMode(mode: TeachingMode): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
}

/** Map a teacher's chosen teaching_tracks to a sensible default mode. */
export function defaultModeForTracks(tracks: string[] | null | undefined): TeachingMode {
  if (tracks && tracks.length) {
    if (tracks.includes('visual')) return 'visual';
    if (tracks.includes('hearing')) return 'hearing';
  }
  return 'general';
}

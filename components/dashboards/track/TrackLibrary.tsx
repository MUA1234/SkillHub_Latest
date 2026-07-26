'use client';

/**
 * Tailored content library for differently-abled students.
 *
 * Visual track  → audio-first: plays the audio / audio-described rendition and
 *                 offers read-aloud of the description.
 * Hearing track → captioned & signed: video with synced captions, a transcript
 *                 link, and a sign-language toggle.
 *
 * Data comes from /api/v1/students/accessibility/library, which is walled to
 * the caller's own track and returns media already presigned for direct
 * playback from Cloudflare R2.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Headphones, Captions, Hand, FileText, Play, X, Search, Volume2, Eye, Ear,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser } from '@/lib/api';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { Illustration } from '@/components/ui/illustration';
import { Track, trackTheme, trackLabel } from '@/lib/accessibility-tracks';
import ReadAloudButton from '@/components/accessibility/ReadAloudButton';

interface Media {
  content_url?: string | null;
  audio_url?: string | null;
  audio_description_url?: string | null;
  caption_url?: string | null;
  transcript_url?: string | null;
  sign_language_video_url?: string | null;
}
interface Features {
  has_audio: boolean; has_audio_description: boolean;
  has_captions: boolean; has_transcripts: boolean; has_sign_language: boolean;
}
interface LibItem {
  id: string; title: string; description?: string; duration?: number | string;
  content_type?: string; course_title?: string; subject_name?: string;
  teacher_name?: string; teacher_avatar?: string | null; thumbnail_url?: string | null;
  media: Media; features: Features;
}

const FILTERS: Record<Track, Array<{ key: string; label: string; icon: React.ReactNode }>> = {
  visual: [
    { key: '', label: 'All', icon: <Headphones className="w-4 h-4" /> },
    { key: 'audio', label: 'Audio', icon: <Volume2 className="w-4 h-4" /> },
    { key: 'audio_description', label: 'Audio described', icon: <Eye className="w-4 h-4" /> },
  ],
  hearing: [
    { key: '', label: 'All', icon: <Captions className="w-4 h-4" /> },
    { key: 'captions', label: 'Captions', icon: <Captions className="w-4 h-4" /> },
    { key: 'transcript', label: 'Transcript', icon: <FileText className="w-4 h-4" /> },
    { key: 'sign_language', label: 'Sign language', icon: <Hand className="w-4 h-4" /> },
  ],
};

function FeatureBadges({ f }: { f: Features }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {f.has_audio && <TagPill tone="forest">Audio</TagPill>}
      {f.has_audio_description && <TagPill tone="forest">Described</TagPill>}
      {f.has_captions && <TagPill tone="mustard">Captions</TagPill>}
      {f.has_transcripts && <TagPill tone="cream">Transcript</TagPill>}
      {f.has_sign_language && <TagPill tone="terracotta">Sign language</TagPill>}
    </div>
  );
}

/** Track-appropriate player rendered in a modal. */
function PlayerModal({ track, item, onClose }: { track: Track; item: LibItem; onClose: () => void }) {
  const [signMode, setSignMode] = useState(false);
  const m = item.media;

  const audioSrc = m.audio_url || m.audio_description_url || null;
  const videoSrc = signMode ? (m.sign_language_video_url || m.content_url) : (m.content_url || m.sign_language_video_url);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="absolute inset-0 bg-espresso/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-cream-50 rounded-3xl border-2 border-espresso shadow-kid-lg overflow-hidden">
        <div className="flex items-center justify-between bg-espresso text-cream px-5 py-3">
          <h3 className="font-display font-bold truncate pr-4">{item.title}</h3>
          <button onClick={onClose} aria-label="Close player" className="rounded-full p-1.5 hover:bg-cream/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {track === 'visual' ? (
            audioSrc ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-espresso">
                  <Headphones className="w-6 h-6 text-forest" />
                  <span className="font-semibold">Now playing — audio lesson</span>
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls autoPlay src={audioSrc} className="w-full" />
              </div>
            ) : videoSrc ? (
              <video controls autoPlay src={videoSrc} className="w-full rounded-2xl border-2 border-espresso bg-black" crossOrigin="anonymous">
                {m.audio_description_url && <track kind="descriptions" src={m.audio_description_url} label="Audio description" />}
              </video>
            ) : (
              <p className="text-sm text-espresso/70">No playable media is attached to this lesson yet.</p>
            )
          ) : (
            videoSrc ? (
              <video controls autoPlay src={videoSrc || undefined} className="w-full rounded-2xl border-2 border-espresso bg-black" crossOrigin="anonymous">
                {m.caption_url && <track kind="captions" src={m.caption_url} srcLang="en" label="Captions" default />}
              </video>
            ) : (
              <p className="text-sm text-espresso/70">No playable video is attached to this lesson yet.</p>
            )
          )}

          {item.description && (
            <div className="rounded-2xl bg-cream-100 border-2 border-espresso/10 p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-xs font-bold uppercase tracking-wide text-espresso/60">About this lesson</span>
                {track === 'visual' && <ReadAloudButton text={item.description} compact />}
              </div>
              <p className="text-sm text-espresso/80 leading-relaxed">{item.description}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {track === 'hearing' && m.sign_language_video_url && (
              <button
                type="button"
                onClick={() => setSignMode((s) => !s)}
                aria-pressed={signMode}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 border-espresso ${signMode ? 'bg-terracotta text-cream' : 'bg-cream text-espresso'}`}
              >
                <Hand className="w-4 h-4" /> {signMode ? 'Showing sign language' : 'Show sign language'}
              </button>
            )}
            {track === 'hearing' && m.transcript_url && (
              <a
                href={m.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 border-espresso bg-cream text-espresso"
              >
                <FileText className="w-4 h-4" /> Open transcript
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TrackLibrary({ track }: { track: Track }) {
  const theme = trackTheme(track);
  const [items, setItems] = useState<LibItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [feature, setFeature] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<LibItem | null>(null);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  const fetchLibrary = async (opts: { feature?: string; search?: string } = {}) => {
    try {
      setIsLoading(true);
      setError('');
      const res = await apiClient.getAccessibilityLibrary({
        feature: opts.feature ?? feature,
        search: opts.search ?? search,
        limit: 60,
      });
      setItems(res?.data?.items || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load your library');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary({ feature });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  const Icon = track === 'visual' ? Eye : Ear;

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />
      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />
        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-6 min-h-[calc(100vh-4rem)]">
          {/* Header */}
          <section className={`rounded-3xl border-2 border-espresso shadow-sticker ${track === 'visual' ? 'bg-forest' : 'bg-coral'} text-cream px-5 py-5`}>
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cream/15 border-2 border-cream/30 shrink-0">
                <Icon className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cream/80">{theme.badge}</span>
                <h1 className="font-display text-2xl sm:text-3xl font-bold">
                  {track === 'visual' ? 'Your audio library' : 'Your captioned library'}
                </h1>
                <p className="text-cream/85 text-sm mt-0.5">
                  {track === 'visual'
                    ? 'Lessons you can listen to — audio and audio-described, ready to play.'
                    : 'Lessons with captions, transcripts and sign language.'}
                </p>
              </div>
            </div>
          </section>

          {/* Filters + search */}
          <section className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTERS[track].map((f) => (
                <button
                  key={f.key || 'all'}
                  type="button"
                  onClick={() => setFeature(f.key)}
                  aria-pressed={feature === f.key}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold border-2 border-espresso transition-transform hover:-translate-y-0.5 ${
                    feature === f.key ? 'bg-espresso text-cream' : 'bg-cream text-espresso'
                  }`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); fetchLibrary(); }}
              className="flex items-center gap-2 ml-auto bg-cream border-2 border-espresso rounded-full px-3 py-1.5"
            >
              <Search className="w-4 h-4 text-espresso/60" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lessons"
                aria-label="Search lessons"
                className="bg-transparent outline-none text-sm text-espresso placeholder:text-espresso/40 w-40"
              />
            </form>
          </section>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-40 rounded-3xl bg-espresso/10 animate-pulse" />)}
            </div>
          ) : error ? (
            <KidCard tone="cream" className="border-coral !p-5">
              <p className="font-semibold text-espresso">Couldn&apos;t load your library</p>
              <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
              <button onClick={() => fetchLibrary()} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
            </KidCard>
          ) : items.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((it) => (
                <KidCard key={it.id} tone="cream" sticker className="flex flex-col">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-espresso text-cream shrink-0">
                        {track === 'visual' ? <Headphones className="w-5 h-5" /> : <Captions className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-lg leading-snug line-clamp-2">{it.title}</h3>
                        <p className="text-xs text-espresso/60 mt-0.5 truncate">
                          {it.subject_name} · {it.teacher_name}
                        </p>
                      </div>
                    </div>
                    <FeatureBadges f={it.features} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setActive(it)}
                    className="btn-kid-primary mt-4 !py-2 !px-4 text-sm w-full justify-center"
                  >
                    <Play className="w-4 h-4" /> {track === 'visual' ? 'Listen' : 'Watch'}
                  </button>
                </KidCard>
              ))}
            </div>
          ) : (
            <KidCard tone="cream" className="flex flex-col items-center text-center py-14">
              <Illustration name="empty-courses" size={170} />
              <h3 className="font-display text-2xl font-bold mt-2 text-espresso">Nothing here yet</h3>
              <p className="text-sm text-espresso/70 mt-1 max-w-sm">
                As teachers add {trackLabel(track).toLowerCase()}-ready lessons, they&apos;ll appear here.
              </p>
              <Link href={`/students/${track}/dashboard`} className="btn-kid-cream mt-5 !py-2 !px-4 text-sm">Back to dashboard</Link>
            </KidCard>
          )}
        </main>
      </div>

      {active && <PlayerModal track={track} item={active} onClose={() => setActive(null)} />}
    </div>
  );
}

'use client';

/**
 * Shared, track-aware student dashboard for the Visual and Hearing tracks.
 *
 * Both /students/visual/dashboard and /students/hearing/dashboard render this
 * with a `track` prop. It combines the normal dashboard data
 * (apiClient.getStudentDashboard) with track-specific extras
 * (apiClient.getAccessibilityDashboard: tailored-library counts, matched
 * specialists, open bookings) and presents a distinct, unmistakable space:
 * a full-width accent identity banner, track-specific shortcuts pointing at the
 * student's own library + specialist finder, and a specialists preview. Global
 * font/contrast/TTS adaptations are applied separately by
 * AdaptiveAccessibilityContext.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Calendar, ArrowRight, PlayCircle, Bell, Check,
  Headphones, Volume2, Captions, Hand, Settings2, FileText, Eye, Ear,
  Star, UserCheck, Sparkles,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { Hero } from '@/components/ui/hero';
import { StatPill } from '@/components/ui/stat-pill';
import { TagPill } from '@/components/ui/tag-pill';
import { KidCard, KidFeatureCard } from '@/components/ui/kid-card';
import { Illustration } from '@/components/ui/illustration';
import { DoodleSparkle, DoodleStar } from '@/components/ui/doodle';
import {
  Track, trackHome, trackLabel, trackTheme, trackSpecialistHref,
} from '@/lib/accessibility-tracks';

interface DashboardData {
  stats: {
    enrolled_courses: number; active_courses: number; completed_courses: number;
    total_study_hours: number; study_streak_days: number;
  };
  enrolled_courses: Array<{
    id: string; title: string; teacher_name: string; subject: string;
    progress_percentage: number; status: string; enrolled_at: string; last_accessed: string;
  }>;
  upcoming_sessions: Array<{
    id: string; title: string; course_title: string; teacher_name: string;
    scheduled_start: string; scheduled_end: string; session_type: string; meeting_link: string;
    status?: string; recording_url?: string | null;
  }>;
  recent_recordings?: Array<{
    id: string; title: string; course_title: string; teacher_name: string;
    scheduled_start: string; scheduled_end: string; recording_url: string;
  }>;
  recent_notifications: Array<any>;
}

interface TrackExtras {
  library: { total: number; audio: number; captioned: number; signed: number };
  specialists: {
    available: number;
    preview: Array<{
      teacher_user_id: string; name: string; avatar_url?: string | null;
      average_rating: number; verified_specialist: boolean; years_experience?: number;
    }>;
  };
  bookings: { open: number; total: number };
}

interface Shortcut {
  href: string; title: string; body: string; icon: React.ReactNode;
  tone: 'terracotta' | 'mustard' | 'forest' | 'cream';
  tilt: 'left' | 'right';
}

interface TrackConfig {
  eyebrow: string;
  icon: React.ReactNode;
  heroBody: string;
  coursesTitle: string;
  sessionsTitle: string;
  shortcuts: Shortcut[];
  toolsTitle: string;
  toolsBody: string;
  toolsPoints: string[];
  libraryLabel: string;
}

const TRACK_CONFIG: Record<Track, TrackConfig> = {
  visual: {
    eyebrow: 'Audio-first learning',
    icon: <Eye className="w-4" />,
    heroBody:
      'Everything here is built to be heard. Listen to your lessons, let read-aloud carry the text, and jump into screen-reader-friendly classes.',
    coursesTitle: 'Keep listening',
    sessionsTitle: 'Audio-described live classes',
    toolsTitle: 'Your listening tools',
    toolsBody: 'Read-aloud, high contrast, and large targets are on. Tune them any time.',
    toolsPoints: [
      'Tap any text to hear it read aloud',
      'Request large-print or braille material from your teacher',
      'Screen-reader landmarks on every page',
    ],
    libraryLabel: 'audio lessons',
    shortcuts: [
      { href: '/students/visual/library', title: 'Listen to lessons', body: 'Audio & audio-described lessons, ready to play.', icon: <Headphones className="w-6 h-6" />, tone: 'terracotta', tilt: 'left' },
      { href: '/students/visual/find-specialist', title: 'Find a specialist', body: 'Teachers trained for the Visual track.', icon: <UserCheck className="w-6 h-6" />, tone: 'mustard', tilt: 'right' },
      { href: '/students/live-sessions', title: 'Screen-reader classes', body: 'Live sessions that work with your reader.', icon: <Volume2 className="w-6 h-6" />, tone: 'forest', tilt: 'left' },
      { href: '/students/settings/accessibility', title: 'Accessibility settings', body: 'Voice, contrast, text size and more.', icon: <Settings2 className="w-6 h-6" />, tone: 'cream', tilt: 'right' },
    ],
  },
  hearing: {
    eyebrow: 'Captioned & signed',
    icon: <Ear className="w-4" />,
    heroBody:
      'Every lesson comes with captions and transcripts, and sign-language content is front and centre. Alerts are visual, never just sound.',
    coursesTitle: 'Captioned courses',
    sessionsTitle: 'Captioned & interpreted live classes',
    toolsTitle: 'Your captioning tools',
    toolsBody: 'Captions are on by default and notifications are visual. Adjust any time.',
    toolsPoints: [
      'Auto-captions on every video',
      'Download full transcripts of each lesson',
      'Sign-language library and interpreted sessions',
    ],
    libraryLabel: 'captioned lessons',
    shortcuts: [
      { href: '/students/hearing/library', title: 'Captioned lessons', body: 'Captions, transcripts & signed explainers.', icon: <Captions className="w-6 h-6" />, tone: 'terracotta', tilt: 'left' },
      { href: '/students/hearing/find-specialist', title: 'Find a specialist', body: 'Teachers trained for the Hearing track.', icon: <UserCheck className="w-6 h-6" />, tone: 'mustard', tilt: 'right' },
      { href: '/students/recordings', title: 'Transcripts', body: 'Read along or download full transcripts.', icon: <FileText className="w-6 h-6" />, tone: 'forest', tilt: 'left' },
      { href: '/students/settings/accessibility', title: 'Accessibility settings', body: 'Captions, visual alerts and more.', icon: <Settings2 className="w-6 h-6" />, tone: 'cream', tilt: 'right' },
    ],
  },
};

const REMINDER_STORAGE_KEY = 'skillhub_session_reminders_v1';

// Accent identity banner — direct classes so both forest (visual) and coral
// (hearing) work regardless of the KidCard tone set.
const BANNER_ACCENT: Record<'forest' | 'coral', string> = {
  forest: 'bg-forest text-cream',
  coral: 'bg-coral text-cream',
};

export default function TrackStudentDashboard({ track }: { track: Track }) {
  const router = useRouter();
  const cfg = TRACK_CONFIG[track];
  const theme = trackTheme(track);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [extras, setExtras] = useState<TrackExtras | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reminderSessionIds, setReminderSessionIds] = useState<Set<string>>(new Set());
  const [pendingReminderId, setPendingReminderId] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';
  const firstName = currentUser?.profile?.first_name || 'Friend';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(REMINDER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setReminderSessionIds(new Set(parsed));
      }
    } catch { /* ignore */ }
  }, []);

  // Belt-and-suspenders guard (the students layout gate is authoritative):
  // student only, matching this track.
  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/auth'); return; }
    const cu = getCurrentUser() as any;
    if (cu?.role !== 'student') { router.replace('/auth'); return; }
    const myTrack = cu?.accessibility_track as Track | null | undefined;
    if (!myTrack) { router.replace('/students/dashboard'); return; }
    if (myTrack !== track) { router.replace(trackHome(myTrack)); return; }
    if (!dashboardData && !error) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, track]);

  const persistReminders = (next: Set<string>) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  };

  const handleSetReminder = async (sessionId: string) => {
    if (reminderSessionIds.has(sessionId) || pendingReminderId === sessionId) return;
    setPendingReminderId(sessionId);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/students/set-reminder/${sessionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setReminderSessionIds((prev) => {
          const next = new Set(prev); next.add(sessionId); persistReminders(next); return next;
        });
      }
    } catch { /* ignore */ } finally {
      setPendingReminderId(null);
    }
  };

  const fetchAll = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [dash, ext] = await Promise.allSettled([
        apiClient.getStudentDashboard(),
        apiClient.getAccessibilityDashboard(),
      ]);
      if (dash.status === 'fulfilled') {
        setDashboardData(dash.value.data);
      } else {
        throw dash.reason;
      }
      if (ext.status === 'fulfilled') setExtras(ext.value.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
      setDashboardData({
        stats: { enrolled_courses: 0, active_courses: 0, completed_courses: 0, total_study_hours: 0, study_streak_days: 0 },
        enrolled_courses: [], upcoming_sessions: [], recent_notifications: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stats = dashboardData?.stats;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />
        <div className="flex pt-16">
          <DashboardSidebar userRole="student" />
          <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8">
            <div className="space-y-6">
              <div className="h-20 rounded-2xl bg-espresso/10 animate-pulse" />
              <div className="h-72 rounded-[2.5rem] bg-espresso/10 animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-2xl bg-espresso/10 animate-pulse" />)}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName={userName} userEmail={userEmail} />

      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />

        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-8 min-h-[calc(100vh-4rem)]">
          {/* Strong identity banner — the unmistakable "which space am I in" cue. */}
          <section
            className={`rounded-3xl border-2 border-espresso shadow-sticker ${BANNER_ACCENT[theme.accent]} px-5 py-4 sm:px-6 sm:py-5`}
            aria-label={`${theme.badge} dashboard`}
          >
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-cream/15 border-2 border-cream/30">
                {track === 'visual' ? <Eye className="w-7 h-7" /> : <Ear className="w-7 h-7" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cream/80">Your dedicated space</span>
                <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                  {theme.badge} · {firstName}
                </h1>
                <p className="text-cream/85 text-sm mt-0.5">
                  {theme.tagline} — every page here is built around how you learn best.
                </p>
              </div>
              <Link
                href="/students/settings/accessibility"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-cream text-espresso border-2 border-espresso px-4 py-2 text-sm font-bold shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform shrink-0"
              >
                <Settings2 className="w-4 h-4" /> Settings
              </Link>
            </div>
          </section>

          {error && (
            <KidCard tone="cream" className="border-coral !p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/10 text-coral text-xl">!</div>
                <div className="flex-1">
                  <p className="font-semibold text-espresso">Couldn&apos;t load your dashboard</p>
                  <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
                  <button onClick={fetchAll} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
                </div>
              </div>
            </KidCard>
          )}

          <Hero
            eyebrow={<>{cfg.icon} {cfg.eyebrow}</>}
            title={
              <>Welcome back, <span className="handwritten scribble-under text-mustard">{firstName}</span> —{' '}
                your <span className="handwritten scribble-under text-terracotta">{trackLabel(track)}</span> space
              </>
            }
            body={cfg.heroBody}
            tags={
              <>
                <TagPill tone="mustard" icon={<DoodleStar className="w-3" />}>{stats?.study_streak_days ?? 0}-day streak</TagPill>
                <TagPill tone="terracotta">{stats?.active_courses ?? 0} active courses</TagPill>
                <TagPill tone="outline" className="!text-cream !border-cream/30">{extras?.library.total ?? 0} {cfg.libraryLabel}</TagPill>
              </>
            }
            primaryCta={
              <Link href={`/students/${track}/library`} className="btn-kid-primary">
                Open my library <ArrowRight className="w-4 h-4" />
              </Link>
            }
            secondaryCta={
              <Link href={trackSpecialistHref(track)} className="btn-kid-ghost !text-cream !border-cream/25 hover:!bg-cream/10">
                Find a specialist
              </Link>
            }
            media={<Illustration name={track === 'visual' ? 'learn-online' : 'live-class'} size={320} priority className="drop-shadow-2xl" />}
          />

          {/* Stat pills */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatPill onDark={false} tone="terracotta" badge="A" value={stats?.active_courses ?? 0} label="Active courses" />
            <StatPill onDark={false} tone="mustard" badge="B" value={extras?.library.total ?? 0} label={`Tailored ${cfg.libraryLabel}`} />
            <StatPill onDark={false} tone="forest" badge="C" value={extras?.specialists.available ?? 0} label="Specialists for you" />
            <StatPill onDark={false} tone="espresso" badge="D" value={`${stats?.study_streak_days ?? 0}d`} label="Streak" />
          </section>

          {/* Track shortcuts */}
          <section className="space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Made for you</span>
              <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                Your <span className="handwritten scribble-under text-terracotta">{trackLabel(track).toLowerCase()}</span> shortcuts
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cfg.shortcuts.map((s) => (
                <Link href={s.href} key={s.href}>
                  <KidFeatureCard
                    tone={s.tone}
                    tilt={s.tilt}
                    title={s.title}
                    body={s.body}
                    illustration={<div className="grid h-16 w-16 place-items-center rounded-2xl bg-espresso text-cream">{s.icon}</div>}
                    cta={<TagPill tone="cream">Open →</TagPill>}
                  />
                </Link>
              ))}
            </div>
          </section>

          {/* Specialists for your track */}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Your specialists</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Teachers trained for <span className="handwritten scribble-under text-terracotta">your track</span>
                </h2>
              </div>
              <Link href={trackSpecialistHref(track)} className="btn-kid-ghost !py-2 !px-4 text-sm">
                See all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {extras?.specialists.preview?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {extras.specialists.preview.map((sp) => (
                  <KidCard key={sp.teacher_user_id} tone="cream" sticker>
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-espresso text-cream overflow-hidden shrink-0">
                        {sp.avatar_url
                          ? <img src={sp.avatar_url} alt="" className="h-full w-full object-cover" />
                          : <UserCheck className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-display font-bold text-lg leading-snug truncate">{sp.name}</h3>
                          {sp.verified_specialist && <Check className="w-4 h-4 text-forest shrink-0" />}
                        </div>
                        <p className="text-xs text-espresso/60 mt-0.5 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-mustard" /> {sp.average_rating?.toFixed(1) ?? '—'}
                          {sp.verified_specialist ? ' · Verified specialist' : ' · Specialist'}
                        </p>
                      </div>
                    </div>
                    <Link href={trackSpecialistHref(track)} className="btn-kid-primary mt-4 !py-2 !px-4 text-sm w-full justify-center">
                      View & book
                    </Link>
                  </KidCard>
                ))}
              </div>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="mentor" size={140} />
                <p className="text-sm text-espresso/70 mt-3 max-w-sm">
                  We&apos;ll list specialists trained for the {trackLabel(track)} track here as they join.
                </p>
                <Link href={trackSpecialistHref(track)} className="btn-kid-cream mt-4 !py-2 !px-4 text-sm">Browse specialists</Link>
              </KidCard>
            )}
          </section>

          {/* Track tools card */}
          <section>
            <KidCard tone="forest" sticker className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] items-center gap-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">{cfg.toolsTitle}</span>
                  <p className="text-cream/85 mt-2 max-w-md text-sm">{cfg.toolsBody}</p>
                  <ul className="mt-4 space-y-2">
                    {cfg.toolsPoints.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-cream/90 text-sm">
                        <Check className="w-4 h-4 mt-0.5 text-mustard shrink-0" /> {p}
                      </li>
                    ))}
                  </ul>
                  <Link href="/students/settings/accessibility" className="btn-kid-cream mt-5 !py-2 !px-4 text-sm inline-flex">
                    Adjust settings
                  </Link>
                </div>
                <div className="relative flex justify-center">
                  <Illustration name="celebrate-win" size={200} />
                  <DoodleSparkle className="absolute bottom-4 left-0 w-8 text-cream animate-wiggle" />
                </div>
              </div>
            </KidCard>
          </section>

          {/* Enrolled courses */}
          <section className="space-y-4">
            <h2 className="font-display text-3xl font-bold text-espresso">{cfg.coursesTitle}</h2>
            {dashboardData?.enrolled_courses?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboardData.enrolled_courses.map((course) => (
                  <KidCard key={course.id} tone="cream" sticker className="cursor-pointer group">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-espresso text-cream">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-lg leading-snug truncate">{course.title}</h3>
                        <p className="text-xs mt-0.5 truncate text-espresso/60">{course.subject} · {course.teacher_name}</p>
                      </div>
                    </div>
                    <div className="mt-5">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1.5 text-espresso/70">
                        <span>Progress</span><span>{course.progress_percentage}%</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden bg-espresso/10">
                        <div className="h-full rounded-full bg-terracotta transition-all duration-700" style={{ width: `${course.progress_percentage}%` }} />
                      </div>
                    </div>
                  </KidCard>
                ))}
              </div>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center justify-center text-center py-12">
                <Illustration name="empty-courses" size={160} />
                <h3 className="font-display text-2xl font-bold mt-2 text-espresso">No courses yet</h3>
                <p className="text-sm text-espresso/70 mt-1 max-w-sm">Find a teacher who specialises in your track and start learning.</p>
                <Link href={trackSpecialistHref(track)} className="btn-kid-primary mt-5">Find a specialist teacher</Link>
              </KidCard>
            )}
          </section>

          {/* Upcoming sessions */}
          <section className="space-y-4">
            <h2 className="font-display text-3xl font-bold text-espresso">{cfg.sessionsTitle}</h2>
            {dashboardData?.upcoming_sessions?.length ? (
              <KidCard tone="espresso" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-cream/10">
                  {dashboardData.upcoming_sessions.map((session) => {
                    const isLive = ['live', 'starting'].includes((session.status || '').toLowerCase());
                    const reminded = reminderSessionIds.has(session.id);
                    const setting = pendingReminderId === session.id;
                    return (
                      <li key={session.id} className="flex items-center gap-4 p-5 hover:bg-cream/5 transition-colors">
                        <div className={`grid h-12 w-12 place-items-center rounded-2xl shrink-0 ${isLive ? 'bg-coral-300 text-cream' : 'bg-mustard text-espresso'}`}>
                          {isLive ? <PlayCircle className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-cream truncate">{session.title}</p>
                          <p className="text-xs text-cream/65 truncate mt-0.5">{session.course_title} · with {session.teacher_name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!isLive && (
                            <button
                              type="button"
                              onClick={() => handleSetReminder(session.id)}
                              disabled={reminded || setting}
                              aria-pressed={reminded}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-colors ${
                                reminded ? 'bg-forest-300/20 text-cream border-forest-200/40 cursor-default' : 'bg-transparent text-cream/85 border-cream/20 hover:border-cream/60 hover:text-cream'
                              }`}
                            >
                              {reminded ? <Check className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                              {reminded ? 'Reminded' : setting ? '…' : 'Remind me'}
                            </button>
                          )}
                          <Link href={session.meeting_link || '/students/live-sessions'} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 border-espresso shadow-sticker-sm ${isLive ? 'bg-coral-300 text-cream' : 'bg-mustard text-espresso'}`}>
                            {isLive ? 'Join live' : 'Open'} <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </KidCard>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="empty-events" size={140} />
                <p className="text-sm text-espresso/70 mt-3">New live sessions will show up here.</p>
                <Link href="/students/live-sessions" className="btn-kid-cream mt-4 !py-2 !px-4 text-sm">Browse sessions</Link>
              </KidCard>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen, Clock, Zap, Calendar, Users, MessageSquare, Trophy,
  ArrowRight, Sparkles, GraduationCap, Bell, Check, PlayCircle,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { useTranslation } from '@/hooks/use-translation';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { OnboardingTour } from '@/components/OnboardingTour';
import { Hero } from '@/components/ui/hero';
import { StatPill } from '@/components/ui/stat-pill';
import { TagPill } from '@/components/ui/tag-pill';
import { KidCard, KidFeatureCard } from '@/components/ui/kid-card';
import { Illustration } from '@/components/ui/illustration';
import { DoodleStar, DoodleSparkle, DoodleSquiggle, DoodleArrow } from '@/components/ui/doodle';
import Link from 'next/link';

interface DashboardData {
  stats: {
    enrolled_courses: number;
    active_courses: number;
    completed_courses: number;
    total_study_hours: number;
    study_streak_days: number;
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
  recent_notifications: Array<{
    id: string; title: string; message: string; type: string;
    is_read: boolean; created_at: string;
  }>;
}

export default function StudentDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reminderSessionIds, setReminderSessionIds] = useState<Set<string>>(new Set());
  const [pendingReminderId, setPendingReminderId] = useState<string | null>(null);

  const REMINDER_STORAGE_KEY = 'skillhub_session_reminders_v1';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(REMINDER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setReminderSessionIds(new Set(parsed));
      }
    } catch {
    }
  }, []);

  const persistReminders = (next: Set<string>) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
    }
  };

  const handleSetReminder = async (sessionId: string) => {
    if (reminderSessionIds.has(sessionId) || pendingReminderId === sessionId) return;
    setPendingReminderId(sessionId);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/students/set-reminder/${sessionId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        setReminderSessionIds((prev) => {
          const next = new Set(prev);
          next.add(sessionId);
          persistReminders(next);
          return next;
        });
      }
    } catch {
    } finally {
      setPendingReminderId(null);
    }
  };

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const firstName = currentUser?.profile?.first_name || 'Friend';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'User'}`.trim();
  const userEmail = currentUser?.email || 'demo@example.com';

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/auth'); return; }
    if (currentUser?.role !== 'student') { router.push('/auth'); return; }
    if (!dashboardData && !error) { fetchDashboardStats(); }
  }, [router, currentUser?.role]);

  const fetchDashboardStats = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await apiClient.getStudentDashboard();
      setDashboardData(response.data);
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setError(err.message || 'Failed to load dashboard data');
      setDashboardData({
        stats: { enrolled_courses: 0, active_courses: 0, completed_courses: 0, total_study_hours: 0, study_streak_days: 0 },
        enrolled_courses: [], upcoming_sessions: [], recent_notifications: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation userRole={userRole as any} userName={userName} userEmail={userEmail} />
        <div className="flex pt-16">
          <DashboardSidebar userRole={userRole as any} />
          <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8">
            <div className="space-y-6">
              <div className="h-72 rounded-[2.5rem] bg-espresso/10 animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-espresso/10 animate-pulse" />)}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-64 rounded-3xl bg-espresso/10 animate-pulse" />
                <div className="h-64 rounded-3xl bg-espresso/10 animate-pulse" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats;

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole={userRole as any} userName={userName} userEmail={userEmail} />

      <div className="flex pt-16">
        <DashboardSidebar userRole={userRole as any} />

        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-8 min-h-[calc(100vh-4rem)]">
          <OnboardingTour role="student" />

          {error && (
            <KidCard tone="cream" className="border-coral !p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/10 text-coral text-xl">!</div>
                <div className="flex-1">
                  <p className="font-semibold text-espresso">Couldn't load your dashboard</p>
                  <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
                  <button onClick={fetchDashboardStats} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
                </div>
              </div>
            </KidCard>
          )}

          {}
          <Hero
            eyebrow={<><DoodleSparkle className="w-4" /> Today's learning lab</>}
            title={
              <>Hey <span className="handwritten scribble-under text-mustard">{firstName}</span>, ready to{' '}
                <span className="handwritten scribble-under text-terracotta">spark</span> something new?
              </>
            }
            body="Pick up where you left off, jump into a live session, or explore something brand new. Your future self is cheering you on."
            tags={
              <>
                <TagPill tone="mustard" icon={<DoodleStar className="w-3" />}>{stats?.study_streak_days ?? 0}-day streak</TagPill>
                <TagPill tone="terracotta">{stats?.active_courses ?? 0} active courses</TagPill>
                <TagPill tone="outline" className="!text-cream !border-cream/30">{stats?.total_study_hours ?? 0}h logged</TagPill>
              </>
            }
            primaryCta={
              <Link href="/students/content-library" className="btn-kid-primary">
                Keep learning <ArrowRight className="w-4 h-4" />
              </Link>
            }
            secondaryCta={
              <Link href="/students/live-sessions" className="btn-kid-ghost !text-cream !border-cream/25 hover:!bg-cream/10">
                Join a live class
              </Link>
            }
            media={
              <div className="relative">
                <Illustration name="learn-online" size={320} priority className="drop-shadow-2xl" />
                <DoodleArrow className="absolute -left-10 top-6 w-16 text-mustard rotate-12 animate-wiggle" />
                <span className="absolute -top-3 right-4 handwritten text-cream/90 text-2xl rotate-6">you've got this!</span>
              </div>
            }
          />

          {}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatPill onDark={false} tone="terracotta" badge="A" value={stats?.active_courses ?? 0} label="Active courses" />
            <StatPill onDark={false} tone="mustard"    badge="B" value={`${stats?.total_study_hours ?? 0}h`} label="Hours studied" />
            <StatPill onDark={false} tone="forest"     badge="C" value={stats?.completed_courses ?? 0} label="Finished" />
            <StatPill onDark={false} tone="espresso"   badge="D" value={`${stats?.study_streak_days ?? 0}d`} label="Streak" />
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Shortcuts</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Jump <span className="handwritten scribble-under text-terracotta">somewhere fun</span>
                </h2>
              </div>
              <DoodleSquiggle className="w-24 text-mustard hidden sm:block" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/students/network/find-teachers">
                <KidFeatureCard
                  tone="terracotta" tilt="left"
                  title="Find a teacher"
                  body="Match with mentors who get your goals."
                  illustration={<Illustration name="mentor" size={88} />}
                  cta={<TagPill tone="cream">Browse →</TagPill>}
                />
              </Link>
              <Link href="/students/content-library">
                <KidFeatureCard
                  tone="mustard" tilt="right"
                  title="My library"
                  body="Lessons, videos, and worksheets ready to go."
                  illustration={<Illustration name="reading" size={88} />}
                  cta={<TagPill tone="espresso">Open →</TagPill>}
                />
              </Link>
              <Link href="/students/live-sessions">
                <KidFeatureCard
                  tone="forest" tilt="left"
                  title="Live classes"
                  body="Hop into a session happening right now."
                  illustration={<Illustration name="live-class" size={88} />}
                  cta={<TagPill tone="cream">See schedule →</TagPill>}
                />
              </Link>
              <Link href="/students/chat">
                <KidFeatureCard
                  tone="cream" tilt="right"
                  title="Messages"
                  body="Chat with classmates, teachers, and your study buddy."
                  illustration={<Illustration name="empty-messages" size={88} />}
                  cta={<TagPill tone="terracotta">Open inbox →</TagPill>}
                />
              </Link>
            </div>
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Your journey</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Courses you're <span className="handwritten scribble-under text-terracotta">crushing</span>
                </h2>
              </div>
              <Link href="/students/content-library" className="btn-kid-ghost !py-2 !px-4 text-sm">View all <ArrowRight className="w-4 h-4" /></Link>
            </div>

            {dashboardData?.enrolled_courses?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboardData.enrolled_courses.map((course, idx) => {
                  const tones: any[] = ['cream', 'mustard', 'cream', 'forest', 'cream', 'terracotta'];
                  const tilts: any[] = ['left', 'right', 'none', 'left', 'right', 'none'];
                  const tone = tones[idx % tones.length];
                  const tilt = tilts[idx % tilts.length];
                  const onDark = tone === 'forest' || tone === 'terracotta' || tone === 'espresso';
                  return (
                    <KidCard key={course.id} tone={tone} tilt={tilt} sticker className="cursor-pointer group">
                      <div className="flex items-start gap-3">
                        <div className={`grid h-11 w-11 place-items-center rounded-2xl ${onDark ? 'bg-cream/15 text-cream' : 'bg-espresso text-cream'}`}>
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display font-bold text-lg leading-snug truncate">{course.title}</h3>
                          <p className={`text-xs mt-0.5 truncate ${onDark ? 'opacity-80' : 'text-espresso/60'}`}>
                            {course.subject} · {course.teacher_name}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className={`flex items-center justify-between text-xs font-semibold mb-1.5 ${onDark ? 'text-cream/80' : 'text-espresso/70'}`}>
                          <span>Progress</span>
                          <span>{course.progress_percentage}%</span>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${onDark ? 'bg-cream/15' : 'bg-espresso/10'}`}>
                          <div
                            className="h-full rounded-full bg-terracotta transition-all duration-700"
                            style={{ width: `${course.progress_percentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <TagPill tone={course.status === 'completed' ? 'forest' : course.status === 'active' ? 'terracotta' : 'cream'}>
                          {course.status}
                        </TagPill>
                        <ArrowRight className={`w-5 h-5 transition-transform group-hover:translate-x-1 ${onDark ? 'text-cream' : 'text-espresso'}`} />
                      </div>
                    </KidCard>
                  );
                })}
              </div>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center justify-center text-center py-12">
                <Illustration name="empty-courses" size={180} />
                <h3 className="font-display text-2xl font-bold mt-2 text-espresso">No courses yet</h3>
                <p className="text-sm text-espresso/70 mt-1 max-w-sm">Start your journey — pick a teacher or jump straight into the library.</p>
                <div className="flex gap-3 mt-5">
                  <Link href="/students/network/find-teachers" className="btn-kid-primary">Find a teacher</Link>
                  <Link href="/students/content-library" className="btn-kid-ghost">Browse library</Link>
                </div>
              </KidCard>
            )}
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Coming up</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Your next <span className="handwritten scribble-under text-terracotta">live moments</span>
                </h2>
              </div>
            </div>

            {dashboardData?.upcoming_sessions?.length ? (
              <KidCard tone="espresso" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-cream/10">
                  {dashboardData.upcoming_sessions.map(session => {
                    const isLive = (session.status || '').toLowerCase() === 'live' || (session.status || '').toLowerCase() === 'starting';
                    const reminded = reminderSessionIds.has(session.id);
                    const setting = pendingReminderId === session.id;
                    return (
                      <li key={session.id} className="flex items-center gap-4 p-5 hover:bg-cream/5 transition-colors">
                        <div className={`grid h-12 w-12 place-items-center rounded-2xl shrink-0 ${isLive ? 'bg-coral-300 text-cream' : 'bg-mustard text-espresso'}`}>
                          {isLive ? <PlayCircle className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-cream truncate">{session.title}</p>
                          <p className="text-xs text-cream/65 truncate mt-0.5">
                            {session.course_title} · with {session.teacher_name}
                          </p>
                        </div>
                        <div className="text-right text-xs text-cream/75 shrink-0 hidden sm:block">
                          <div className="font-semibold">{new Date(session.scheduled_start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                          <div className="text-cream/55">{new Date(session.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!isLive && (
                            <button
                              type="button"
                              onClick={() => handleSetReminder(session.id)}
                              disabled={reminded || setting}
                              aria-pressed={reminded}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-colors ${
                                reminded
                                  ? 'bg-forest-300/20 text-cream border-forest-200/40 cursor-default'
                                  : 'bg-transparent text-cream/85 border-cream/20 hover:border-cream/60 hover:text-cream'
                              }`}
                              title={reminded ? 'Reminder set' : 'Remind me before this session starts'}
                            >
                              {reminded ? <Check className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                              {reminded ? 'Reminded' : setting ? '…' : 'Remind me'}
                            </button>
                          )}
                          <Link
                            href={session.meeting_link || '/students/live-sessions'}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform ${
                              isLive ? 'bg-coral-300 text-cream' : 'bg-mustard text-espresso'
                            }`}
                          >
                            {isLive ? 'Join live' : 'Open'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </KidCard>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="empty-events" size={160} />
                <h3 className="font-display text-xl font-bold mt-2 text-espresso">All clear for now</h3>
                <p className="text-sm text-espresso/70 mt-1">New live sessions will show up here.</p>
                <Link href="/students/live-sessions" className="btn-kid-cream mt-5 !py-2 !px-4 text-sm">Browse sessions</Link>
              </KidCard>
            )}
          </section>

          {}
          {dashboardData?.recent_recordings && dashboardData.recent_recordings.length > 0 && (
            <section>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-forest-500">Replay</span>
                  <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                    Catch up on <span className="handwritten scribble-under text-forest-500">recordings</span>
                  </h2>
                </div>
                <Link href="/students/recordings" className="btn-kid-ghost !py-2 !px-4 text-sm">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <KidCard tone="cream" className="!p-0 overflow-hidden">
                <ul className="divide-y-2 divide-espresso/10">
                  {dashboardData.recent_recordings.map((rec) => (
                    <li key={rec.id} className="flex items-center gap-4 p-5 hover:bg-cream-100 transition-colors">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-300 text-cream border-2 border-espresso shrink-0">
                        <PlayCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-espresso truncate">{rec.title}</p>
                        <p className="text-xs text-espresso/65 truncate mt-0.5">
                          {rec.course_title} · with {rec.teacher_name}
                        </p>
                      </div>
                      <div className="text-right text-xs text-espresso/55 shrink-0 hidden sm:block">
                        {rec.scheduled_end ? new Date(rec.scheduled_end).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                      </div>
                      <a
                        href={rec.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-forest-300 text-cream border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform shrink-0"
                      >
                        Watch
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </KidCard>
            </section>
          )}

          {}
          <section className="relative">
            <KidCard tone="forest" sticker className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] items-center gap-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Daily nudge</span>
                  <h3 className="font-display text-3xl font-bold mt-2">
                    A little bit, <span className="handwritten text-mustard">every day</span>.
                  </h3>
                  <p className="text-cream/80 mt-2 max-w-md text-sm">Even 15 minutes of focused practice beats a marathon once a month. We've got tiny lessons that fit anywhere.</p>
                  <div className="flex gap-3 mt-5 flex-wrap">
                    <Link href="/students/pre-recorded-lessons" className="btn-kid-cream !py-2 !px-4 text-sm">15-minute lessons</Link>
                    <Link href="/students/progress-report" className="btn-kid-ghost !text-cream !border-cream/30 hover:!bg-cream/10 !py-2 !px-4 text-sm">See progress</Link>
                  </div>
                </div>
                <div className="relative flex justify-center">
                  <Illustration name="celebrate-win" size={220} />
                  <DoodleStar className="absolute top-0 right-2 w-6 text-mustard animate-float" />
                  <DoodleSparkle className="absolute bottom-4 left-0 w-8 text-cream animate-wiggle" />
                </div>
              </div>
            </KidCard>
          </section>
        </main>
      </div>
    </div>
  );
}

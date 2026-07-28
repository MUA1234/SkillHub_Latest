'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, DollarSign, BookOpen, Star, Calendar, Upload, BarChart3,
  Settings, RefreshCw, Clock, ToggleLeft, ToggleRight, Megaphone, ArrowRight,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { OnboardingTour } from '@/components/OnboardingTour';
import { useTranslation } from '@/hooks/use-translation';
import { formatCurrency } from '@/lib/format';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Hero } from '@/components/ui/hero';
import { StatPill } from '@/components/ui/stat-pill';
import { TagPill } from '@/components/ui/tag-pill';
import { KidCard, KidFeatureCard } from '@/components/ui/kid-card';
import { Illustration } from '@/components/ui/illustration';
import { DoodleStar, DoodleSparkle, DoodleSquiggle, DoodleArrow } from '@/components/ui/doodle';
import TeachingModeSwitch from '@/components/teacher/TeachingModeSwitch';
import { useTeachingMode } from '@/contexts/TeachingModeContext';
import { teachingModeConfig } from '@/lib/teaching-mode';

interface TeacherStats {
  total_students: number;
  monthly_earnings: number;
  active_courses: number;
  average_rating: number;
  recent_classes: Array<{ id: string; subject: string; students: number; time: string }>;
}

export default function TeacherDashboard() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { mode } = useTeachingMode();
  const modeCfg = teachingModeConfig(mode);

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const firstName = currentUser?.profile?.first_name || 'Teacher';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Teacher'}`.trim();
  const userEmail = currentUser?.email || 'demo@teacher.com';

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/auth'); return; }
    if (currentUser?.role !== 'teacher') { router.push('/auth'); return; }
    if (!stats && !error) { fetchDashboardStats(); }
  }, [router, currentUser?.role]);

  const fetchDashboardStats = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError('');

      const [profileResult, sessionsResult] = await Promise.allSettled([
        apiClient.getTeacherProfile(),
        apiClient.getTeacherSessions(),
      ]);

      const profileData: any = profileResult.status === 'fulfilled' ? profileResult.value : null;
      const sessionsData: any = sessionsResult.status === 'fulfilled' ? sessionsResult.value : null;

      const sessionsArray = Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : [];
      const recentClasses = sessionsArray
        .filter((s: any) => s?.status === 'completed')
        .slice(0, 5)
        .map((s: any) => ({
          id: s?.id || Math.random().toString(),
          subject: s?.title || 'Untitled Session',
          students: s?.current_participants || 0,
          time: s?.actual_end || s?.scheduled_end || new Date().toISOString(),
        }));

      setStats({
        total_students: profileData?.stats?.total_students ?? 0,
        monthly_earnings: profileData?.stats?.monthly_earnings ?? 0,
        active_courses: profileData?.stats?.total_courses ?? 0,
        average_rating: profileData?.stats?.average_rating ?? 0,
        recent_classes: recentClasses,
      });
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setError(err?.message || 'Failed to load dashboard data');
      setStats({ total_students: 0, monthly_earnings: 0, active_courses: 0, average_rating: 0, recent_classes: [] });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchDashboardStats(), 60_000);
    return () => clearInterval(id);
  }, [autoRefresh]);

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
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole={userRole as any} userName={userName} userEmail={userEmail} />

      <div className="flex pt-16">
        <DashboardSidebar userRole={userRole as any} />

        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-8 min-h-[calc(100vh-4rem)]">
          <OnboardingTour role="teacher" />

          {/* The "main switch": one dashboard, three teaching contexts. */}
          <TeachingModeSwitch />

          {mode !== 'general' && (
            <KidCard tone={mode === 'visual' ? 'forest' : 'espresso'} sticker className="!py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <p className="font-display font-bold text-cream text-lg">
                    You&apos;re teaching {modeCfg.label.toLowerCase()}
                  </p>
                  <p className="text-cream/85 text-sm mt-0.5">{modeCfg.uploadRule}</p>
                </div>
                <Link href="/teachers/content/upload" className="btn-kid-cream !py-2.5 !px-5 shrink-0 inline-flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Upload {mode === 'visual' ? 'an audiobook' : 'a video'}
                </Link>
              </div>
            </KidCard>
          )}

          {error && (
            <KidCard tone="cream" className="border-coral !p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/10 text-coral text-xl">!</div>
                <div className="flex-1">
                  <p className="font-semibold text-espresso">Couldn't load your dashboard</p>
                  <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
                  <button onClick={() => fetchDashboardStats()} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
                </div>
              </div>
            </KidCard>
          )}

          {}
          <Hero
            tone="dark"
            eyebrow={<><DoodleSparkle className="w-4" /> Teacher studio</>}
            title={
              <>
                Welcome back, <span className="handwritten scribble-under text-mustard">{firstName}</span>.<br />
                Let's <span className="handwritten scribble-under text-terracotta">spark</span> some learning.
              </>
            }
            body="Your students are showing up. Here's what's happening across your classes today."
            tags={
              <>
                <TagPill tone="mustard">{stats?.total_students ?? 0} students</TagPill>
                <TagPill tone="terracotta">{stats?.active_courses ?? 0} active courses</TagPill>
                <TagPill tone="outline" className="!text-cream !border-cream/30">{(stats?.average_rating || 0).toFixed(1)} ★ rating</TagPill>
              </>
            }
            primaryCta={
              <Link href="/teachers/content/upload" className="btn-kid-primary">
                Upload lesson <ArrowRight className="w-4 h-4" />
              </Link>
            }
            secondaryCta={
              <Link href="/teachers/live-sessions" className="btn-kid-ghost !text-cream !border-cream/25 hover:!bg-cream/10">
                Start a live class
              </Link>
            }
            media={
              <div className="relative">
                <Illustration name="welcome-teacher" size={320} priority className="drop-shadow-2xl" />
                <DoodleArrow className="absolute -left-10 top-6 w-16 text-mustard rotate-12 animate-wiggle" />
                <span className="absolute -top-3 right-4 handwritten text-cream/90 text-2xl rotate-6">they're learning!</span>
              </div>
            }
          />

          {}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {lastUpdated && (
              <p className="text-xs font-semibold text-espresso/55 inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => fetchDashboardStats(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-full border-2 border-espresso/15 bg-cream-50 text-espresso hover:border-espresso hover:-translate-y-0.5 hover:shadow-sticker-sm transition-transform disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setAutoRefresh(v => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-full border-2 border-espresso/15 bg-cream-50 text-espresso hover:border-espresso transition-colors"
              >
                {autoRefresh ? <ToggleRight className="w-4 h-4 text-forest" /> : <ToggleLeft className="w-4 h-4 text-espresso/45" />}
                Auto {autoRefresh ? 'on' : 'off'}
              </button>
              <Link href="/teachers/analytics" className="btn-kid-cream !py-2 !px-4 text-sm">
                <BarChart3 className="w-4 h-4" /> Analytics
              </Link>
            </div>
          </div>

          {}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatPill onDark={false} tone="forest"     badge="A" value={stats?.total_students || 0}                                                    label={t('dashboard.totalStudents')} />
            <StatPill onDark={false} tone="mustard"    badge="B" value={formatCurrency(stats?.monthly_earnings || 0, { locale: language })}            label={t('dashboard.monthlyEarnings')} />
            <StatPill onDark={false} tone="terracotta" badge="C" value={stats?.active_courses || 0}                                                    label={t('dashboard.activeCourses')} />
            <StatPill onDark={false} tone="espresso"   badge="D" value={stats?.average_rating ? parseFloat(stats.average_rating.toString()).toFixed(1) : '0.0'} label={t('dashboard.averageRating')} />
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-forest">Studio shortcuts</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Make <span className="handwritten scribble-under text-terracotta">something great</span> today
                </h2>
              </div>
              <DoodleSquiggle className="w-24 text-mustard hidden sm:block" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/teachers/content">
                <KidFeatureCard
                  tone="forest" tilt="left"
                  title="Content library"
                  body="Manage lessons, upload videos, build worksheets."
                  illustration={<Illustration name="reading" size={88} />}
                  cta={<TagPill tone="cream">Open →</TagPill>}
                />
              </Link>
              <Link href="/teachers/students">
                <KidFeatureCard
                  tone="mustard" tilt="right"
                  title="My students"
                  body="Progress, notes, parent comms — all in one place."
                  illustration={<Illustration name="study-group" size={88} />}
                  cta={<TagPill tone="espresso">View →</TagPill>}
                />
              </Link>
              <Link href="/teachers/live-sessions">
                <KidFeatureCard
                  tone="terracotta" tilt="left"
                  title="Live sessions"
                  body="Schedule, host, and review live classes."
                  illustration={<Illustration name="live-class" size={88} />}
                  cta={<TagPill tone="cream">Schedule →</TagPill>}
                />
              </Link>
              <Link href="/teachers/earnings">
                <KidFeatureCard
                  tone="cream" tilt="right"
                  title="Earnings"
                  body="See your payouts and student funding sources."
                  illustration={<Illustration name="celebrate-win" size={88} />}
                  cta={<TagPill tone="forest">Open →</TagPill>}
                />
              </Link>
            </div>
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-forest">Recent</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Your latest <span className="handwritten scribble-under text-terracotta">live classes</span>
                </h2>
              </div>
              <Link href="/teachers/live-sessions" className="btn-kid-ghost !py-2 !px-4 text-sm">View all <ArrowRight className="w-4 h-4" /></Link>
            </div>

            {stats?.recent_classes?.length ? (
              <KidCard tone="espresso" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-cream/10">
                  {stats.recent_classes.map(c => (
                    <li key={c.id}>
                      <div className="flex items-center gap-4 p-5 hover:bg-cream/5 transition-colors">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mustard text-espresso shrink-0">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-cream truncate">{c.subject}</p>
                          <p className="text-xs text-cream/65 truncate mt-0.5">{c.students} students attended</p>
                        </div>
                        <div className="text-right text-xs text-cream/75 shrink-0">
                          <div className="font-semibold">{new Date(c.time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </KidCard>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="empty-events" size={160} />
                <h3 className="font-display text-xl font-bold mt-2 text-espresso">No recent classes</h3>
                <p className="text-sm text-espresso/70 mt-1">{t('dashboard.noRecentClasses', 'Your recent sessions will appear here.')}</p>
                <Link href="/teachers/live-sessions" className="btn-kid-primary mt-5 !py-2 !px-4 text-sm">Schedule a class</Link>
              </KidCard>
            )}
          </section>

          {}
          <section>
            <KidCard tone="forest" sticker className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] items-center gap-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">For you</span>
                  <h3 className="font-display text-3xl font-bold mt-2">
                    Teaching is <span className="handwritten text-mustard">how kids grow</span>.
                  </h3>
                  <p className="text-cream/80 mt-2 max-w-md text-sm">Every lesson plants something. Thanks for showing up — your students notice.</p>
                  <div className="flex gap-3 mt-5 flex-wrap">
                    <Link href="/teachers/analytics"   className="btn-kid-cream !py-2 !px-4 text-sm">See your impact</Link>
                    <Link href="/teachers/settings/specializations" className="btn-kid-ghost !text-cream !border-cream/30 hover:!bg-cream/10 !py-2 !px-4 text-sm">Tune your profile</Link>
                  </div>
                </div>
                <div className="relative flex justify-center">
                  <Illustration name="mentor" size={220} />
                  <DoodleStar className="absolute top-0 right-2 w-6 text-mustard animate-float" />
                </div>
              </div>
            </KidCard>
          </section>
        </main>
      </div>
    </div>
  );
}

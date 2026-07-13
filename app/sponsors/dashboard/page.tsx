'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Target, DollarSign, Users, Calendar, BarChart3, ArrowRight,
  ArrowUpRight, ArrowDownRight, Sparkles, Activity,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { OnboardingTour } from '@/components/OnboardingTour';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { useRouter } from 'next/navigation';
import { Hero } from '@/components/ui/hero';
import { StatPill } from '@/components/ui/stat-pill';
import { TagPill } from '@/components/ui/tag-pill';
import { KidCard, KidFeatureCard } from '@/components/ui/kid-card';
import { Illustration } from '@/components/ui/illustration';
import { DoodleStar, DoodleSparkle, DoodleSquiggle, DoodleArrow } from '@/components/ui/doodle';

interface SponsorDashboardData {
  stats: {
    activeCampaigns: number;
    totalBudget: number;
    studentsReached: number;
    eventsHosted: number;
    teacherPartnerships: number;
    roi: number;
  };
  recentCampaigns: Array<{
    id: string; title: string; status: string; budget: number; spent: number;
    reach: number; startDate: string; endDate: string;
  }>;
  upcomingEvents: Array<{ id: string; title: string; date: string; attendees: number; location: string }>;
  recentActivity: Array<{ id: string; type: string; message: string; timestamp: string }>;
}

export default function SponsorDashboard() {
  const router = useRouter();
  const { language } = useTranslation();
  const [dashboardData, setDashboardData] = useState<SponsorDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'sponsor';
  const firstName = currentUser?.profile?.first_name || 'Sponsor';
  const userName = `${currentUser?.profile?.first_name || 'Sponsor'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/auth'); return; }
    if (currentUser?.role !== 'sponsor') { router.push('/auth'); return; }
    fetchDashboardData();
  }, [router, currentUser?.role]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [dashboardResponse, campaignsResponse, eventsResponse, impactResponse] = await Promise.all([
        apiClient.getSponsorDashboard().catch(() => null),
        apiClient.getSponsorCampaigns({}).catch(() => ({ campaigns: [] })),
        apiClient.getSponsorEvents({}).catch(() => ({ events: [] })),
        apiClient.getSponsorRecentImpact(30).catch(() => null),
      ]);

      const stats = dashboardResponse?.stats || {};
      const campaigns = campaignsResponse?.campaigns || [];
      const events = eventsResponse?.events || [];
      const impactActivities = Array.isArray(impactResponse?.activities)
        ? impactResponse.activities
        : Array.isArray(impactResponse)
          ? impactResponse
          : [];

      setDashboardData({
        stats: {
          activeCampaigns: stats.active_campaigns || campaigns.filter((c: any) => c.status === 'active').length || 0,
          totalBudget: stats.total_budget || 0,
          studentsReached: stats.students_reached || 0,
          eventsHosted: stats.events_hosted || events.length || 0,
          teacherPartnerships: stats.teacher_partnerships || 0,
          roi: stats.roi || 0,
        },
        recentCampaigns: campaigns.slice(0, 3).map((c: any) => ({
          id: c.id, title: c.title || 'Campaign', status: c.status || 'active',
          budget: c.budget || 0, spent: c.spent || 0, reach: c.reach || 0,
          startDate: c.start_date || c.created_at, endDate: c.end_date || '',
        })),
        upcomingEvents: events.slice(0, 3).map((e: any) => ({
          id: e.id, title: e.title || 'Event',
          date: e.start_date || e.created_at,
          attendees: e.attendees || e.registered_count || 0,
          location: e.location || 'Online',
        })),
        recentActivity: impactActivities.slice(0, 10).map((a: any) => ({
          id: String(a.id || `${a.type}-${a.date}`),
          type: a.type || 'Update',
          message: a.description || a.message || '',
          timestamp: a.date || '',
        })),
      });
    } catch (err: any) {
      console.error('Dashboard error:', err);
      const is404 = err?.status === 404 || (typeof err?.message === 'string' && err.message.includes('404'));
      if (!is404) setError(err.message || 'Failed to load dashboard data');
      setDashboardData({
        stats: { activeCampaigns: 0, totalBudget: 0, studentsReached: 0, eventsHosted: 0, teacherPartnerships: 0, roi: 0 },
        recentCampaigns: [], upcomingEvents: [], recentActivity: [],
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
          <OnboardingTour role="sponsor" />

          {error && (
            <KidCard tone="cream" className="border-coral !p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/10 text-coral text-xl">!</div>
                <div className="flex-1">
                  <p className="font-semibold text-espresso">Couldn't load dashboard</p>
                  <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
                  <button onClick={fetchDashboardData} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
                </div>
              </div>
            </KidCard>
          )}

          {}
          <Hero
            tone="dark"
            eyebrow={<><DoodleSparkle className="w-4" /> Impact studio</>}
            title={
              <>
                Hi <span className="handwritten scribble-under text-mustard">{firstName}</span>,<br />
                let's <span className="handwritten scribble-under text-terracotta">change</span> some futures.
              </>
            }
            body={`${formatNumber(dashboardData?.stats?.studentsReached || 0, { locale: language })} students reached so far. Here's what your support is doing right now.`}
            tags={
              <>
                <TagPill tone="mustard">{dashboardData?.stats?.activeCampaigns ?? 0} active</TagPill>
                <TagPill tone="terracotta">{dashboardData?.stats?.eventsHosted ?? 0} events</TagPill>
                <TagPill tone="outline" className="!text-cream !border-cream/30">{formatCurrency(dashboardData?.stats?.totalBudget || 0, { locale: language, compact: true })} pledged</TagPill>
              </>
            }
            primaryCta={
              <Link href="/sponsors/campaigns" className="btn-kid-primary">
                New campaign <ArrowRight className="w-4 h-4" />
              </Link>
            }
            secondaryCta={
              <Link href="/sponsors/scholarships" className="btn-kid-ghost !text-cream !border-cream/25 hover:!bg-cream/10">
                Mint scholarships
              </Link>
            }
            media={
              <div className="relative">
                <Illustration name="welcome-sponsor" size={320} priority className="drop-shadow-2xl" />
                <DoodleArrow className="absolute -left-10 top-6 w-16 text-mustard rotate-12 animate-wiggle" />
                <span className="absolute -top-3 right-4 handwritten text-cream/90 text-2xl rotate-6">thank you!</span>
              </div>
            }
          />

          {}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatPill onDark={false} tone="mustard"    badge="A" value={dashboardData?.stats?.activeCampaigns || 0}                                                    label="Active campaigns" />
            <StatPill onDark={false} tone="terracotta" badge="B" value={formatCurrency(dashboardData?.stats?.totalBudget || 0, { locale: language, compact: true })}   label="Total budget" />
            <StatPill onDark={false} tone="forest"     badge="C" value={formatNumber(dashboardData?.stats?.studentsReached || 0, { locale: language })}                label="Students reached" />
            <StatPill onDark={false} tone="espresso"   badge="D" value={dashboardData?.stats?.eventsHosted || 0}                                                       label="Events hosted" />
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Shortcuts</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Where to <span className="handwritten scribble-under text-terracotta">make a dent</span>
                </h2>
              </div>
              <DoodleSquiggle className="w-24 text-mustard hidden sm:block" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/sponsors/campaigns">
                <KidFeatureCard
                  tone="mustard" tilt="left"
                  title="Campaigns"
                  body="Run sponsorship drives and track real reach."
                  illustration={<Illustration name="helping-hand" size={88} />}
                  cta={<TagPill tone="espresso">Open →</TagPill>}
                />
              </Link>
              <Link href="/sponsors/scholarships">
                <KidFeatureCard
                  tone="terracotta" tilt="right"
                  title="Scholarships"
                  body="Fund learners directly with capped grants."
                  illustration={<Illustration name="empty-scholarships" size={88} />}
                  cta={<TagPill tone="cream">Mint →</TagPill>}
                />
              </Link>
              <Link href="/sponsors/connect-teachers">
                <KidFeatureCard
                  tone="forest" tilt="left"
                  title="Find teachers"
                  body="Partner with verified educators near you."
                  illustration={<Illustration name="mentor" size={88} />}
                  cta={<TagPill tone="cream">Browse →</TagPill>}
                />
              </Link>
              <Link href="/sponsors/analytics">
                <KidFeatureCard
                  tone="cream" tilt="right"
                  title="Analytics"
                  body="See the outcomes your money is creating."
                  illustration={<Illustration name="progress-chart" size={88} />}
                  cta={<TagPill tone="terracotta">View →</TagPill>}
                />
              </Link>
            </div>
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Recent</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  Campaigns in <span className="handwritten scribble-under text-terracotta">motion</span>
                </h2>
              </div>
              <Link href="/sponsors/campaigns" className="btn-kid-ghost !py-2 !px-4 text-sm">View all <ArrowRight className="w-4 h-4" /></Link>
            </div>

            {dashboardData?.recentCampaigns?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dashboardData.recentCampaigns.map((c, idx) => {
                  const tones: any[] = ['cream', 'mustard', 'forest'];
                  const tilts: any[] = ['left', 'right', 'left'];
                  const tone = tones[idx % tones.length];
                  const onDark = tone === 'forest' || tone === 'espresso' || tone === 'terracotta';
                  const pct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0;
                  return (
                    <KidCard key={c.id} tone={tone} tilt={tilts[idx % tilts.length]} sticker className="cursor-pointer group">
                      <div className="flex items-start gap-3">
                        <div className={`grid h-11 w-11 place-items-center rounded-2xl ${onDark ? 'bg-cream/15 text-cream' : 'bg-espresso text-cream'}`}>
                          <Target className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display font-bold text-lg leading-snug truncate">{c.title}</h3>
                          <p className={`text-xs mt-0.5 ${onDark ? 'opacity-80' : 'text-espresso/60'}`}>
                            Budget {formatCurrency(c.budget, { locale: language })}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5">
                        <div className={`flex items-center justify-between text-xs font-semibold mb-1.5 ${onDark ? 'text-cream/80' : 'text-espresso/70'}`}>
                          <span>Spent</span>
                          <span>{pct.toFixed(0)}%</span>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${onDark ? 'bg-cream/15' : 'bg-espresso/10'}`}>
                          <div className="h-full rounded-full bg-terracotta transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <TagPill tone={c.status === 'completed' ? 'forest' : c.status === 'active' ? 'terracotta' : 'cream'}>
                          {c.status}
                        </TagPill>
                        <span className={`text-xs font-semibold ${onDark ? 'text-cream/75' : 'text-espresso/65'}`}>
                          {formatNumber(c.reach, { locale: language })} reached
                        </span>
                      </div>
                    </KidCard>
                  );
                })}
              </div>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-12">
                <Illustration name="empty-scholarships" size={180} />
                <h3 className="font-display text-2xl font-bold mt-2 text-espresso">No campaigns yet</h3>
                <p className="text-sm text-espresso/70 mt-1 max-w-sm">Start your first campaign and watch lives change.</p>
                <Link href="/sponsors/campaigns" className="btn-kid-primary mt-5">Create campaign</Link>
              </KidCard>
            )}
          </section>

          {}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Calendar</span>
                <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                  What's <span className="handwritten scribble-under text-terracotta">coming up</span>
                </h2>
              </div>
              <Link href="/sponsors/events" className="btn-kid-ghost !py-2 !px-4 text-sm">View all <ArrowRight className="w-4 h-4" /></Link>
            </div>

            {dashboardData?.upcomingEvents?.length ? (
              <KidCard tone="espresso" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-cream/10">
                  {dashboardData.upcomingEvents.map(e => (
                    <li key={e.id}>
                      <Link href="/sponsors/events" className="flex items-center gap-4 p-5 hover:bg-cream/5 transition-colors">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mustard text-espresso shrink-0">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-cream truncate">{e.title}</p>
                          <p className="text-xs text-cream/65 truncate mt-0.5">{e.location}</p>
                        </div>
                        <div className="text-right text-xs text-cream/75 shrink-0">
                          <div className="font-semibold">{e.date ? new Date(e.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}</div>
                          <div className="text-cream/55 inline-flex items-center gap-1 mt-0.5"><Users className="w-3 h-3" /> {e.attendees}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </KidCard>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="empty-events" size={160} />
                <h3 className="font-display text-xl font-bold mt-2 text-espresso">Nothing scheduled</h3>
                <p className="text-sm text-espresso/70 mt-1">Host an event to engage with students and teachers.</p>
                <Link href="/sponsors/events" className="btn-kid-primary mt-5 !py-2 !px-4 text-sm">Create event</Link>
              </KidCard>
            )}
          </section>

          {}
          {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-end justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Last 30 days</span>
                  <h2 className="font-display text-3xl font-bold text-espresso mt-1">
                    Recent <span className="handwritten scribble-under text-terracotta">activity</span>
                  </h2>
                </div>
                <Link href="/sponsors/impact" className="btn-kid-ghost !py-2 !px-4 text-sm">
                  Impact details <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <KidCard tone="cream" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-espresso/10">
                  {dashboardData.recentActivity.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 p-5 hover:bg-cream-100/50 transition-colors"
                    >
                      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-terracotta text-cream shrink-0">
                        {a.type?.toLowerCase().includes('event') ? (
                          <Calendar className="w-4 h-4" />
                        ) : a.type?.toLowerCase().includes('campaign') ? (
                          <Target className="w-4 h-4" />
                        ) : (
                          <Activity className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-espresso">{a.type}</p>
                        <p className="text-sm text-espresso/70 mt-0.5">{a.message}</p>
                      </div>
                      <span className="text-xs text-espresso/55 shrink-0 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {a.timestamp}
                      </span>
                    </li>
                  ))}
                </ul>
              </KidCard>
            </section>
          )}

          {}
          <section>
            <KidCard tone="mustard" sticker className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] items-center gap-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Your impact</span>
                  <h3 className="font-display text-3xl font-bold mt-2 text-espresso">
                    Small gifts. <span className="handwritten text-terracotta">Huge ripples.</span>
                  </h3>
                  <p className="text-espresso/75 mt-2 max-w-md text-sm">Every rupee you put in reaches a learner who can't afford to be left behind. Thank you for showing up.</p>
                  <div className="flex gap-3 mt-5 flex-wrap">
                    <Link href="/sponsors/analytics" className="btn-kid-primary !py-2 !px-4 text-sm">See impact report</Link>
                    <Link href="/sponsors/impact"    className="btn-kid-ghost !py-2 !px-4 text-sm">Stories from the field</Link>
                  </div>
                </div>
                <div className="relative flex justify-center">
                  <Illustration name="celebrate-win" size={220} />
                  <DoodleStar className="absolute top-0 right-2 w-6 text-coral animate-float" />
                  <DoodleSparkle className="absolute bottom-4 left-0 w-8 text-espresso animate-wiggle" />
                </div>
              </div>
            </KidCard>
          </section>
        </main>
      </div>
    </div>
  );
}

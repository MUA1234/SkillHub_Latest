'use client';

/**
 * Student-facing campaign discovery.
 *
 * Sponsors create themed funding pushes ("Maths for low-income students",
 * "Scholarships for hearing-impaired learners", etc.) under
 * /sponsors/campaigns. There was no surface where a student could actually
 * see those campaigns — the Sp → S half of the discovery loop was missing.
 *
 * This page lists every active sponsor campaign (status active/launched,
 * not past its end_date), shows who is funding it, progress so far, and
 * routes students to the scholarships + access-codes flows where they can
 * actually capture the value the campaign created.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Megaphone, Loader2, AlertCircle, Award, Ticket, Users,
  Calendar, Search, ArrowRight, Sparkles,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

interface Campaign {
  id: string;
  title: string;
  description: string;
  sponsor_name: string;
  budget_lkr: number;
  students_reached: number;
  completion_percentage: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export default function StudentCampaignsPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName = `${currentUser?.profile?.first_name || 'Student'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/students/campaigns?limit=50`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to load campaigns (${res.status})`);
      }
      const json = await res.json();
      const list: Campaign[] = json?.data?.campaigns || [];
      setCampaigns(list);
    } catch (err: any) {
      setError(err?.message || 'Could not load campaigns.');
      setCampaigns([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCampaigns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) =>
      [c.title, c.description, c.sponsor_name].some((s) => (s || '').toLowerCase().includes(q)),
    );
  }, [campaigns, query]);

  const formatRange = (start: string | null, end: string | null) => {
    if (!start && !end) return 'Open until filled';
    const fmt = (s: string | null) =>
      s ? new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    if (start && end) return `${fmt(start)} → ${fmt(end)}`;
    if (end) return `Until ${fmt(end)}`;
    return `Starts ${fmt(start)}`;
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6">
              <PageHeader title="Sponsor" accent="campaigns" />
              <p className="text-espresso/70 mt-2 max-w-2xl">
                Themed funding pushes from sponsors. Each campaign unlocks scholarships,
                access codes, or events you can use to keep learning.
              </p>
            </div>

            {}
            <div className="bg-cream-50 rounded-2xl border-2 border-espresso/10 shadow-kid p-4 mb-6 flex items-center gap-3">
              <Search className="w-5 h-5 text-espresso/55 ml-2 shrink-0" />
              <input
                type="text"
                placeholder="Search campaigns by topic or sponsor name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-espresso placeholder:text-espresso/45 outline-none py-2"
                aria-label="Search campaigns"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-xs font-semibold text-espresso/55 hover:text-espresso px-2"
                >
                  Clear
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="text-center py-16">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-terracotta" />
                <p className="text-espresso/70 text-sm">Loading campaigns…</p>
              </div>
            ) : error ? (
              <div className="bg-coral-50 border-2 border-coral-200 rounded-2xl p-6 text-center max-w-md mx-auto">
                <AlertCircle className="w-10 h-10 text-coral-400 mx-auto mb-3" />
                <p className="text-coral-400 font-semibold mb-2">Couldn't load campaigns</p>
                <p className="text-sm text-espresso/70 mb-4">{error}</p>
                <button onClick={fetchCampaigns} className="btn-kid-primary">
                  Try again
                </button>
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <EmptyState
                illustration="empty-events"
                title={query ? 'No matching campaigns' : 'No campaigns are running right now'}
                body={
                  query
                    ? 'Try a different search term — sponsors add new campaigns each month.'
                    : 'Check back soon. New scholarships and access codes drop with every campaign.'
                }
                actions={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href="/students/scholarships" className="btn-kid-primary">
                      Browse scholarships
                    </Link>
                    <Link href="/students/redeem-code" className="btn-kid-cream">
                      Have a code?
                    </Link>
                  </div>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredCampaigns.map((c, index) => {
                  const progress = Math.min(100, Math.max(0, c.completion_percentage));
                  return (
                    <motion.article
                      key={c.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.05, 0.4) }}
                    >
                      <KidCard tone="cream" className="!p-6 h-full flex flex-col">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mustard text-espresso border-2 border-espresso shadow-sticker-sm shrink-0">
                            <Megaphone className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h2 className="font-display text-xl font-bold text-espresso truncate">
                              {c.title}
                            </h2>
                            <p className="text-xs text-espresso/65 mt-0.5">
                              Funded by <span className="font-semibold text-espresso">{c.sponsor_name}</span>
                            </p>
                          </div>
                        </div>

                        {c.description && (
                          <p className="text-sm text-espresso/75 line-clamp-3 mb-4">
                            {c.description}
                          </p>
                        )}

                        <dl className="grid grid-cols-2 gap-3 mb-4 text-xs">
                          <div className="bg-cream-100 rounded-xl border border-espresso/10 px-3 py-2">
                            <dt className="text-espresso/55 uppercase tracking-wide font-semibold">Budget</dt>
                            <dd className="text-espresso font-semibold mt-0.5">
                              {formatCurrency(c.budget_lkr, { locale: language, compact: true })}
                            </dd>
                          </div>
                          <div className="bg-cream-100 rounded-xl border border-espresso/10 px-3 py-2">
                            <dt className="text-espresso/55 uppercase tracking-wide font-semibold flex items-center gap-1">
                              <Users className="w-3 h-3" /> Reached
                            </dt>
                            <dd className="text-espresso font-semibold mt-0.5">
                              {c.students_reached.toLocaleString()} students
                            </dd>
                          </div>
                        </dl>

                        {}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-espresso/65 font-semibold">Progress</span>
                            <span className="text-espresso font-bold">{Math.round(progress)}%</span>
                          </div>
                          <div className="h-2 bg-cream-200 border border-espresso/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-mustard rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-espresso/10">
                          <span className="inline-flex items-center gap-1.5 text-xs text-espresso/65">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatRange(c.start_date, c.end_date)}
                          </span>
                          <div className="flex items-center gap-2">
                            <Link
                              href="/students/scholarships"
                              className="inline-flex items-center gap-1 text-xs font-bold text-espresso bg-cream-50 border-2 border-espresso/15 rounded-full px-3 py-1.5 hover:border-espresso/40 transition-colors"
                              title="See linked scholarships"
                            >
                              <Award className="w-3.5 h-3.5" />
                              Scholarships
                            </Link>
                            <Link
                              href="/students/redeem-code"
                              className="inline-flex items-center gap-1 text-xs font-bold text-cream bg-terracotta border-2 border-espresso rounded-full px-3 py-1.5 shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
                              title="Redeem an access code from this campaign"
                            >
                              <Ticket className="w-3.5 h-3.5" />
                              Redeem
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      </KidCard>
                    </motion.article>
                  );
                })}
              </div>
            )}

            {}
            {!isLoading && !error && filteredCampaigns.length > 0 && (
              <section className="mt-10">
                <KidCard tone="forest" sticker className="overflow-hidden">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mustard text-espresso shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-xl font-bold text-cream">
                        Got an invite code from a sponsor?
                      </h3>
                      <p className="text-cream/75 text-sm mt-1">
                        Redeem it to unlock funded sessions, scholarships, or events.
                      </p>
                    </div>
                    <Link href="/students/redeem-code" className="btn-kid-cream !py-2 !px-4 text-sm">
                      <Ticket className="w-4 h-4" />
                      Redeem now
                    </Link>
                  </div>
                </KidCard>
              </section>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

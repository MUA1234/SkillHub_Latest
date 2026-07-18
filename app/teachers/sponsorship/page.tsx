'use client';

/**
 * Teacher-side sponsorship requests.
 *
 * Sponsors review and approve/reject requests on /sponsors/connect-teachers,
 * but there was no teacher-facing surface to submit them — the Sp queue
 * sat empty forever. This page closes the loop: teachers describe a
 * project, request funding, and watch the status flip as sponsors decide.
 *
 * Endpoints used:
 *   GET    /api/v1/teachers/sponsorship          — list my requests
 *   POST   /api/v1/teachers/sponsorship          — create a new one
 *   PUT    /api/v1/teachers/sponsorship/{id}     — edit / withdraw
 *   DELETE /api/v1/teachers/sponsorship/{id}     — remove
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, Plus, Heart, Users, Clock,
  CheckCircle2, XCircle, Trash2, X, DollarSign,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

interface SponsorshipRequest {
  id: string;
  title: string;
  description?: string;
  amount_requested: number;
  students_impacted: number;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at?: string | null;
  reviewer_notes?: string | null;
}

const statusStyles: Record<string, { label: string; cls: string; Icon: any }> = {
  pending: { label: 'Awaiting review', cls: 'bg-mustard-50 border-mustard-200 text-espresso', Icon: Clock },
  under_review: { label: 'Under review', cls: 'bg-terracotta-50 border-terracotta-200 text-espresso', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-forest-50 border-forest-200 text-forest-500', Icon: CheckCircle2 },
  rejected: { label: 'Not funded', cls: 'bg-coral-50 border-coral-200 text-coral-400', Icon: XCircle },
};

export default function TeacherSponsorshipPage() {
  const router = useRouter();
  const { language } = useTranslation();
  const [requests, setRequests] = useState<SponsorshipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', amount_requested: 0, students_impacted: 0 });
  const [creating, setCreating] = useState(false);

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const userName = `${currentUser?.profile?.first_name || 'Teacher'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'teacher') {
      router.push('/auth');
      return;
    }
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient.getTeacherSponsorship();
      const list: SponsorshipRequest[] = Array.isArray(result)
        ? result
        : (result?.requests || result?.data?.requests || []);
      setRequests(list);
    } catch (err: any) {
      setError(err?.message || 'Could not load your sponsorship requests.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const submitDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || draft.amount_requested <= 0) {
      alert('Please fill in a title and amount.');
      return;
    }
    setCreating(true);
    try {
      await apiClient.createSponsorshipRequest({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        amount_requested: Number(draft.amount_requested),
        students_impacted: Number(draft.students_impacted) || 0,
      });
      setIsCreateOpen(false);
      setDraft({ title: '', description: '', amount_requested: 0, students_impacted: 0 });
      loadRequests();
    } catch (err: any) {
      alert(err?.message || 'Could not submit request.');
    } finally {
      setCreating(false);
    }
  };

  const withdraw = async (req: SponsorshipRequest) => {
    if (!confirm(`Withdraw your request "${req.title}"?`)) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/teachers/sponsorship/${req.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      loadRequests();
    } catch (err: any) {
      alert(err?.message || 'Could not withdraw.');
    }
  };

  const totalRequested = requests.reduce((s, r) => s + (r.amount_requested || 0), 0);
  const totalApproved = requests
    .filter((r) => r.status === 'approved')
    .reduce((s, r) => s + (r.amount_requested || 0), 0);
  const pendingCount = requests.filter((r) => r.status === 'pending' || r.status === 'under_review').length;

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <PageHeader title="Sponsorship" accent="requests" />
                <p className="text-espresso/70 mt-2 max-w-2xl">
                  Ask sponsors to fund a project — new materials, a workshop series,
                  scholarships for your students. Each request gets reviewed by every
                  active sponsor on the platform.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="btn-kid-primary"
              >
                <Plus className="w-4 h-4" />
                New request
              </button>
            </div>

            {}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <KidCard tone="cream" className="!p-5">
                <div className="text-xs font-bold uppercase tracking-wide text-espresso/55">Total requested</div>
                <div className="text-2xl font-bold text-espresso mt-1">
                  {formatCurrency(totalRequested, { locale: language, compact: true })}
                </div>
              </KidCard>
              <KidCard tone="cream" className="!p-5">
                <div className="text-xs font-bold uppercase tracking-wide text-espresso/55">Approved</div>
                <div className="text-2xl font-bold text-forest-500 mt-1">
                  {formatCurrency(totalApproved, { locale: language, compact: true })}
                </div>
              </KidCard>
              <KidCard tone="cream" className="!p-5">
                <div className="text-xs font-bold uppercase tracking-wide text-espresso/55">Awaiting review</div>
                <div className="text-2xl font-bold text-terracotta mt-1">{pendingCount}</div>
              </KidCard>
            </div>

            {loading ? (
              <div className="text-center py-16">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-terracotta" />
                <p className="text-espresso/70 text-sm">Loading your requests…</p>
              </div>
            ) : error ? (
              <div className="bg-coral-50 border-2 border-coral-200 rounded-2xl p-6 text-center max-w-md mx-auto">
                <AlertCircle className="w-10 h-10 text-coral-400 mx-auto mb-3" />
                <p className="text-coral-400 font-semibold mb-2">Couldn't load requests</p>
                <p className="text-sm text-espresso/70 mb-4">{error}</p>
                <button onClick={loadRequests} className="btn-kid-primary">Try again</button>
              </div>
            ) : requests.length === 0 ? (
              <EmptyState
                illustration="helping-hand"
                title="No sponsorship requests yet"
                body="Sponsors are looking to fund classrooms like yours. Submit a project and they can review it from their dashboard."
                actions={
                  <button onClick={() => setIsCreateOpen(true)} className="btn-kid-primary">
                    <Plus className="w-4 h-4" />
                    Submit your first request
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {requests.map((req) => {
                  const style = statusStyles[req.status] || statusStyles.pending;
                  const StatusIcon = style.Icon;
                  return (
                    <KidCard key={req.id} tone="cream" className="!p-5 flex flex-col">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-terracotta text-cream border-2 border-espresso shadow-sticker-sm shrink-0">
                          <Heart className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display text-lg font-bold text-espresso truncate">{req.title}</h3>
                          <p className="text-xs text-espresso/65 mt-0.5">
                            Submitted {new Date(req.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border-2 ${style.cls}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {style.label}
                        </span>
                      </div>
                      {req.description && (
                        <p className="text-sm text-espresso/75 line-clamp-3 mb-3">{req.description}</p>
                      )}
                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-cream-100 rounded-xl border border-espresso/10 px-3 py-2">
                          <dt className="text-espresso/55 uppercase tracking-wide font-semibold flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Requested
                          </dt>
                          <dd className="text-espresso font-bold mt-0.5">
                            {formatCurrency(req.amount_requested, { locale: language, compact: true })}
                          </dd>
                        </div>
                        <div className="bg-cream-100 rounded-xl border border-espresso/10 px-3 py-2">
                          <dt className="text-espresso/55 uppercase tracking-wide font-semibold flex items-center gap-1">
                            <Users className="w-3 h-3" /> Impacts
                          </dt>
                          <dd className="text-espresso font-bold mt-0.5">{req.students_impacted} students</dd>
                        </div>
                      </dl>
                      {req.reviewer_notes && (
                        <p className="text-xs text-espresso/65 italic mt-3 border-l-2 border-espresso/15 pl-2">
                          Reviewer notes: {req.reviewer_notes}
                        </p>
                      )}
                      {(req.status === 'pending' || req.status === 'under_review') && (
                        <div className="mt-auto pt-3 border-t border-espresso/10 flex justify-end">
                          <button
                            type="button"
                            onClick={() => withdraw(req)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-coral-400 hover:text-coral-300 px-2 py-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Withdraw
                          </button>
                        </div>
                      )}
                    </KidCard>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-espresso/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl border-2 border-espresso shadow-kid-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="bg-espresso text-cream px-6 py-4 rounded-t-3xl flex items-center justify-between">
              <h2 className="text-xl font-bold">New sponsorship request</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-cream/65 hover:text-cream rounded-full p-1 hover:bg-cream/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitDraft} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-espresso mb-1">Project title *</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                  placeholder="e.g. Art supplies for Grade 6"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-espresso mb-1">What it's for</label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none resize-none"
                  placeholder="Describe the project, who it helps, and how the funds will be used."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-espresso mb-1">Amount requested (LKR) *</label>
                  <input
                    type="number"
                    min={1}
                    step={100}
                    value={draft.amount_requested || ''}
                    onChange={(e) => setDraft({ ...draft, amount_requested: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-espresso mb-1">Students impacted</label>
                  <input
                    type="number"
                    min={0}
                    value={draft.students_impacted || ''}
                    onChange={(e) => setDraft({ ...draft, students_impacted: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t-2 border-espresso/10">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-kid-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-kid-primary disabled:opacity-50">
                  {creating ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

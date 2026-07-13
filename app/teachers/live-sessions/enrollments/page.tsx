'use client';

/**
 * Teacher-side session-enrollment queue.
 *
 * Students POST /api/v1/enrollments/sessions/{id}/enroll → a row lands
 * in live_live_session_enrollment_requests AND a `session_enrollment_request`
 * notification fires to the teacher with link_url=/teachers/live-sessions/enrollments.
 *
 * Until this page landed there was no UI behind that link — teachers
 * saw the bell ring but had nowhere to act. Approve/reject here flips
 * the request's status, notifies the student, and (on approve, if the
 * session requires payment) routes them to the checkout via the
 * notification's link_url.
 *
 * Endpoints used:
 *   GET   /api/v1/teachers/sessions                       — list my sessions
 *   GET   /api/v1/enrollments/sessions/{id}/enrollments   — list requests
 *   PATCH /api/v1/enrollments/enrollments/{id}/respond    — approve/reject
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface EnrollmentRow {
  id: string;
  session_id: string;
  student_id: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  request_message?: string | null;
  teacher_response?: string | null;
  requested_at?: string | null;
  responded_at?: string | null;
  enrolled_at?: string | null;
}

interface SessionLite {
  id: string;
  title: string;
  scheduled_start?: string;
}

interface EnrichedEnrollment extends EnrollmentRow {
  session_title: string;
  session_scheduled_start?: string;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_PILL: Record<
  string,
  { label: string; cls: string; Icon: typeof Clock }
> = {
  pending: {
    label: 'Awaiting your decision',
    cls: 'bg-mustard/20 text-mustard-500',
    Icon: Clock,
  },
  approved: {
    label: 'Approved',
    cls: 'bg-forest/15 text-forest-500',
    Icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    cls: 'bg-coral/15 text-coral',
    Icon: XCircle,
  },
};

export default function TeacherEnrollmentsPage() {
  const router = useRouter();
  const { language } = useTranslation();
  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'teacher';
  const userName =
    `${currentUser?.profile?.first_name || 'Teacher'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<EnrichedEnrollment[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'teacher') {
      router.push('/auth');
      return;
    }
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEnrollments = async () => {
    try {
      setLoading(true);
      setError(null);

      const sessionsResp = await apiClient.getTeacherSessions();
      const sessions: SessionLite[] = Array.isArray(sessionsResp)
        ? sessionsResp
        : sessionsResp?.sessions || sessionsResp?.data?.sessions || [];

      if (!sessions.length) {
        setEnrollments([]);
        return;
      }

      const settled = await Promise.allSettled(
        sessions.map(async (s) => {
          const resp = await apiClient.getSessionEnrollmentRequests(s.id);
          const rows: EnrollmentRow[] = resp?.enrollments || [];
          return rows.map<EnrichedEnrollment>((r) => ({
            ...r,
            session_title: s.title,
            session_scheduled_start: s.scheduled_start,
          }));
        }),
      );

      const all: EnrichedEnrollment[] = [];
      for (const result of settled) {
        if (result.status === 'fulfilled') all.push(...result.value);
      }
      all.sort((a, b) => {
        const ad = a.requested_at || '';
        const bd = b.requested_at || '';
        return bd.localeCompare(ad);
      });
      setEnrollments(all);
    } catch (err: any) {
      setError(err?.message || 'Could not load enrollment requests.');
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: enrollments.length };
    for (const e of enrollments) {
      if (e.status === 'pending') c.pending++;
      else if (e.status === 'approved') c.approved++;
      else if (e.status === 'rejected') c.rejected++;
    }
    return c;
  }, [enrollments]);

  const visible = useMemo(() => {
    if (statusFilter === 'all') return enrollments;
    return enrollments.filter((e) => e.status === statusFilter);
  }, [enrollments, statusFilter]);

  const formatWhen = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(
        language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK',
        { dateStyle: 'medium', timeStyle: 'short' },
      ).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const handleRespond = async (
    row: EnrichedEnrollment,
    action: 'approve' | 'reject',
  ) => {
    if (actingId) return;
    const message = (responseDrafts[row.id] || '').trim();
    if (action === 'reject' && !message) {
      const ok = confirm(
        'Reject without a note? The student will only see a generic rejection. Continue?',
      );
      if (!ok) return;
    }
    setActingId(row.id);
    try {
      await apiClient.respondToEnrollmentRequest(
        row.id,
        action,
        message || undefined,
      );
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      setEnrollments((prev) =>
        prev.map((e) =>
          e.id === row.id
            ? {
                ...e,
                status: newStatus,
                teacher_response: message || e.teacher_response,
                responded_at: new Date().toISOString(),
              }
            : e,
        ),
      );
      setResponseDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
    } catch (err: any) {
      alert(
        err?.message ||
          `Could not ${action} the enrollment request. Please try again.`,
      );
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole="teacher" />

      <div className="pt-20 pb-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <PageHeader title="Enrollment" accent="requests" />
              <p className="text-espresso/70 mt-2">
                Students who asked to join your live sessions. Approve to put them on the roster
                (or unlock the payment step if your session is paid).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadEnrollments}
                className="clay-card px-3 py-2 text-espresso hover:bg-cream-100 flex items-center"
                disabled={loading}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
              <button
                onClick={() => router.push('/teachers/live-sessions')}
                className="clay-card px-3 py-2 text-espresso hover:bg-cream-100 flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to sessions
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                    statusFilter === f
                      ? 'bg-terracotta text-white'
                      : 'clay-card text-espresso hover:bg-cream-100'
                  }`}
                >
                  {f}
                  <span
                    className={`ml-2 text-xs ${
                      statusFilter === f ? 'opacity-90' : 'text-espresso/55'
                    }`}
                  >
                    {counts[f]}
                  </span>
                </button>
              ),
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-terracotta mr-3" />
              <span className="text-espresso/70">Loading enrollment requests…</span>
            </div>
          ) : error ? (
            <div className="bg-coral/15 border border-coral text-coral px-4 py-3 rounded flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="flex-1">{error}</span>
              <button
                onClick={loadEnrollments}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              title={
                statusFilter === 'pending'
                  ? 'No pending requests'
                  : statusFilter === 'all'
                  ? 'No enrollment requests yet'
                  : `No ${statusFilter} requests`
              }
              body={
                statusFilter === 'pending'
                  ? 'When a student asks to join one of your sessions, it appears here for you to approve or reject.'
                  : 'Switch the filter above to see requests in other states.'
              }
            />
          ) : (
            <div className="space-y-4">
              {visible.map((row) => {
                const pill =
                  STATUS_PILL[row.status] || STATUS_PILL.pending;
                const Icon = pill.Icon;
                const isActing = actingId === row.id;
                const draft = responseDrafts[row.id] || '';
                return (
                  <div
                    key={row.id}
                    className="clay-card p-5 hover:bg-cream-100/40 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="text-xs text-espresso/55 uppercase tracking-wider mb-1">
                          Session
                        </div>
                        <div className="text-lg font-semibold text-espresso">
                          {row.session_title}
                        </div>
                        {row.session_scheduled_start && (
                          <div className="text-sm text-espresso/70 mt-1">
                            Scheduled {formatWhen(row.session_scheduled_start)}
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 inline-flex items-center text-xs font-semibold rounded-full ${pill.cls}`}
                      >
                        <Icon className="w-3 h-3 mr-1" />
                        {pill.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-espresso/55 uppercase tracking-wider mb-1">
                          Student request
                        </div>
                        <div className="text-sm text-espresso/85 whitespace-pre-wrap">
                          {row.request_message?.trim() || (
                            <span className="text-espresso/55 italic">
                              (no message attached)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-espresso/55 mt-2">
                          Requested {formatWhen(row.requested_at)}
                        </div>
                      </div>

                      {row.status === 'pending' ? (
                        <div>
                          <label
                            htmlFor={`note-${row.id}`}
                            className="block text-xs text-espresso/55 uppercase tracking-wider mb-1"
                          >
                            Optional note (shown to student)
                          </label>
                          <textarea
                            id={`note-${row.id}`}
                            value={draft}
                            onChange={(e) =>
                              setResponseDrafts((d) => ({
                                ...d,
                                [row.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            maxLength={500}
                            placeholder="e.g. Looking forward to having you — please review the prep notes before joining."
                            className="w-full px-3 py-2 border border-espresso/15 rounded-lg text-sm text-espresso bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/40"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-espresso/55 uppercase tracking-wider mb-1">
                            Your note to the student
                          </div>
                          <div className="text-sm text-espresso/85 whitespace-pre-wrap">
                            {row.teacher_response?.trim() || (
                              <span className="text-espresso/55 italic">
                                (no note recorded)
                              </span>
                            )}
                          </div>
                          {row.responded_at && (
                            <div className="text-xs text-espresso/55 mt-2">
                              Responded {formatWhen(row.responded_at)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {row.status === 'pending' && (
                      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-espresso/10">
                        <button
                          onClick={() => handleRespond(row, 'reject')}
                          disabled={isActing}
                          className="clay-card px-4 py-2 text-coral hover:bg-coral/10 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </button>
                        <button
                          onClick={() => handleRespond(row, 'approve')}
                          disabled={isActing}
                          className="px-4 py-2 rounded-lg bg-forest-500 text-white hover:bg-forest-600 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isActing ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                          )}
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

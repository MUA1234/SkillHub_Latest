'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  AlertCircle,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

interface Application {
  id: string;
  scholarship_id: string;
  student_id: string;
  statement_of_need?: string | null;
  family_income_lkr?: number | null;
  school?: string | null;
  grade?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'funded' | 'withdrawn';
  reviewer_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  student_first_name?: string | null;
  student_last_name?: string | null;
  student_avatar_url?: string | null;
}

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-mustard/15 text-mustard-500 border-amber-200',
  approved: 'bg-forest/10 text-forest-500 border-forest/30',
  rejected: 'bg-coral/10 text-coral border-coral/30',
  funded: 'bg-terracotta/10 text-terracotta-500 border-terracotta/30',
  withdrawn: 'bg-cream-100 text-espresso/70 border-espresso/15',
};

export default function SponsorApplicationsPage() {
  const router = useRouter();
  const params = useParams();
  const scholarshipId = params.id as string;
  const { t, language } = useTranslation();

  const [scholarship, setScholarship] = useState<any | null>(null);
  const [items, setItems] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Application | null>(null);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Sponsor'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'sponsor') {
      router.push('/auth');
      return;
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholarshipId]);

  const fetchAll = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [scholarshipData, applications] = await Promise.all([
        apiClient.getMyScholarship(scholarshipId),
        apiClient.listScholarshipApplications(scholarshipId),
      ]);
      setScholarship(scholarshipData?.scholarship || null);
      setItems(applications?.applications || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load applications.');
    } finally {
      setIsLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const a of items) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole="sponsor"
        userName={userName}
        userEmail={userEmail}
      />
      <div className="flex pt-16">
        <DashboardSidebar userRole="sponsor" />
        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8">
          <Link
            href="/sponsors/scholarships"
            className="inline-flex items-center gap-1 text-sm text-espresso/70 hover:text-espresso mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('scholarship.title')}
          </Link>

          <div className="flex items-center justify-between mb-6">
            <div>
              <PageHeader title="Review the" accent="applications" />
              {scholarship && (
                <p className="text-espresso/70 mt-1 flex items-center gap-2">
                  <Award className="w-4 h-4 text-mustard-500" />
                  <span className="font-medium">{scholarship.title}</span>
                  <span className="text-espresso/45">·</span>
                  <span>
                    {formatCurrency(scholarship.total_amount_lkr, {
                      locale: language,
                    })}
                  </span>
                  <span className="text-espresso/45">·</span>
                  <span>
                    {t('scholarship.slotsAvailable', {
                      filled: scholarship.slots_filled,
                      slots: scholarship.slots_available,
                    })}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <CountTile label={t('scholarship.application.status.pending')} value={counts.pending} icon={<Clock className="w-4 h-4" />} accent="amber" />
            <CountTile label={t('scholarship.application.status.approved')} value={counts.approved} icon={<CheckCircle2 className="w-4 h-4" />} accent="green" />
            <CountTile label={t('scholarship.application.status.rejected')} value={counts.rejected} icon={<XCircle className="w-4 h-4" />} accent="red" />
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-mustard-500 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-espresso/20 bg-cream-50 py-16 text-center text-espresso/55">
              {t('scholarship.application.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((app) => (
                <ApplicationRow
                  key={app.id}
                  app={app}
                  language={language}
                  t={t}
                  onReview={() => setReviewing(app)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {reviewing && scholarship && (
        <ReviewModal
          application={reviewing}
          scholarship={scholarship}
          onClose={() => setReviewing(null)}
          onCompleted={(updatedStatus) => {
            setItems((prev) =>
              prev.map((a) =>
                a.id === reviewing.id ? { ...a, status: updatedStatus as any } : a,
              ),
            );
            setReviewing(null);
          }}
        />
      )}
    </div>
  );
}

const CountTile = ({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: 'amber' | 'green' | 'red';
}) => {
  const tone =
    accent === 'amber'
      ? 'bg-mustard/15 text-mustard-500'
      : accent === 'green'
        ? 'bg-forest/10 text-forest-500'
        : 'bg-coral/10 text-coral';
  return (
    <div className="rounded-xl bg-cream-50 border border-espresso/10 p-4 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-espresso/55">{label}</p>
        <p className="text-2xl font-bold text-espresso mt-0.5">{value}</p>
      </div>
      <span className={`p-2 rounded-lg ${tone}`}>{icon}</span>
    </div>
  );
};

const ApplicationRow = ({
  app,
  language,
  t,
  onReview,
}: {
  app: Application;
  language: string;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  onReview: () => void;
}) => {
  const fullName = [app.student_first_name, app.student_last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || app.student_id.slice(0, 8);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-cream-50 border border-espresso/10 p-4 shadow-sm hover:shadow transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-mustard-500 flex items-center justify-center font-semibold flex-shrink-0">
            {(app.student_first_name?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-espresso truncate">{fullName}</p>
            <p className="text-xs text-espresso/55">
              {new Date(app.created_at).toLocaleDateString(language)}
            </p>
            {app.statement_of_need && (
              <p className="mt-2 text-sm text-espresso line-clamp-2">
                {app.statement_of_need}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-espresso/55">
              {app.school && (
                <span>
                  <strong className="text-espresso">
                    {t('scholarship.application.school')}:
                  </strong>{' '}
                  {app.school}
                </span>
              )}
              {app.grade && (
                <span>
                  <strong className="text-espresso">
                    {t('scholarship.application.grade')}:
                  </strong>{' '}
                  {app.grade}
                </span>
              )}
              {typeof app.family_income_lkr === 'number' && (
                <span>
                  <strong className="text-espresso">
                    {t('scholarship.application.familyIncome')}:
                  </strong>{' '}
                  {formatCurrency(app.family_income_lkr, { locale: language })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[app.status]}`}
          >
            {t(`scholarship.application.status.${app.status}`)}
          </span>
          {app.status === 'pending' && (
            <button
              onClick={onReview}
              className="rounded-lg bg-mustard-400 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              {t('common.view')}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const ReviewModal = ({
  application,
  scholarship,
  onClose,
  onCompleted,
}: {
  application: Application;
  scholarship: any;
  onClose: () => void;
  onCompleted: (status: string) => void;
}) => {
  const { t, language } = useTranslation();
  const defaultGrant =
    Number(scholarship.total_amount_lkr || 0) /
    Math.max(1, Number(scholarship.slots_available || 1));
  const [grantAmount, setGrantAmount] = useState<number>(Math.round(defaultGrant));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: 'approve' | 'reject') => {
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.reviewScholarshipApplication(application.id, {
        action,
        reviewer_notes: notes.trim() || undefined,
        grant_amount_lkr: action === 'approve' ? grantAmount : undefined,
      });
      onCompleted(action === 'approve' ? 'approved' : 'rejected');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit decision.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl bg-cream-50 shadow-2xl overflow-hidden"
      >
        <div className="border-b border-espresso/10 px-6 py-4">
          <h2 className="text-xl font-bold text-espresso">
            {[application.student_first_name, application.student_last_name]
              .filter(Boolean)
              .join(' ') || application.student_id.slice(0, 8)}
          </h2>
          <p className="text-sm text-espresso/55 mt-0.5">{scholarship.title}</p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {application.statement_of_need && (
            <Block label={t('scholarship.application.statementOfNeed')}>
              {application.statement_of_need}
            </Block>
          )}
          {typeof application.family_income_lkr === 'number' && (
            <Block label={t('scholarship.application.familyIncome')}>
              {formatCurrency(application.family_income_lkr, { locale: language })}
            </Block>
          )}
          {application.school && (
            <Block label={t('scholarship.application.school')}>
              {application.school}
            </Block>
          )}
          {application.grade && (
            <Block label={t('scholarship.application.grade')}>
              {application.grade}
            </Block>
          )}

          <label className="block">
            <span className="block text-sm font-medium text-espresso mb-1">
              {t('scholarship.application.grantAmount')}
            </span>
            <input
              type="number"
              min={0}
              value={grantAmount}
              onChange={(e) => setGrantAmount(Number(e.target.value))}
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-espresso mb-1">
              {t('scholarship.application.reviewerNotes')}
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </label>

          {error && (
            <div role="alert" className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-espresso/10 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-espresso/20 bg-cream-50 px-4 py-2 text-sm font-medium text-espresso hover:bg-cream-100"
          >
            {t('common.cancel')}
          </button>
          <button
            disabled={submitting}
            onClick={() => submit('reject')}
            className="rounded-lg border border-red-300 bg-cream-50 px-4 py-2 text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-60"
          >
            {t('scholarship.application.reject')}
          </button>
          <button
            disabled={submitting}
            onClick={() => submit('approve')}
            className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-400 disabled:opacity-60"
          >
            {t('scholarship.application.approve')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-espresso/55">{label}</p>
    <p className="mt-0.5 text-sm text-espresso whitespace-pre-line">{children}</p>
  </div>
);

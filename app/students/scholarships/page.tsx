'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Award,
  Loader2,
  AlertCircle,
  X,
  Sparkles,
  MapPin,
  Users,
  CheckCircle2,
  ArrowRight,
  Ticket,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import { DictateButton } from '@/components/accessibility/DictateButton';

interface Scholarship {
  id: string;
  title: string;
  description?: string;
  total_amount_lkr: number;
  slots_available: number;
  slots_filled: number;
  status: string;
  target_disability_types: string[];
  target_locations: string[];
  eligibility_criteria: Record<string, any>;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

interface MyApplication {
  id: string;
  scholarship_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'funded' | 'withdrawn';
}

export default function StudentScholarshipsPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [items, setItems] = useState<Scholarship[]>([]);
  const [myApps, setMyApps] = useState<MyApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<Scholarship | null>(null);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Student'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [openResult, mineResult] = await Promise.all([
        apiClient.listOpenScholarships(),
        apiClient.listMyScholarshipApplications().catch(() => ({ applications: [] })),
      ]);
      setItems(openResult?.scholarships || []);
      setMyApps((mineResult?.applications as MyApplication[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load scholarships.');
    } finally {
      setIsLoading(false);
    }
  };

  const myAppByScholarship = useMemo(() => {
    const map: Record<string, MyApplication> = {};
    for (const a of myApps) map[a.scholarship_id] = a;
    return map;
  }, [myApps]);

  const onApplied = (scholarshipId: string, application: MyApplication) => {
    setMyApps((prev) => {
      const others = prev.filter((a) => a.scholarship_id !== scholarshipId);
      return [...others, application];
    });
    setApplyTarget(null);
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole="student"
        userName={userName}
        userEmail={userEmail}
      />
      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />
        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8">
          <PageHeader
            className="mb-6"
            eyebrow={`${items.length} open`}
            title="Find the right"
            accent="scholarship"
            body={t('scholarship.title') ?? 'Funded learning opportunities tailored to where you are now.'}
            actions={
              <>
                <Link href="/students/scholarships/applications" className="btn-kid-ghost !py-2 !px-4 text-sm">
                  {t('scholarship.myApplications')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/students/redeem-code" className="btn-kid-primary !py-2 !px-4 text-sm">
                  <Ticket className="w-4 h-4" />
                  {t('redeem.title')}
                </Link>
              </>
            }
          />

          {error && (
            <KidCard tone="cream" className="!p-4 border-coral mb-4">
              <p className="text-sm text-coral font-semibold inline-flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>{error}</span>
              </p>
            </KidCard>
          )}

          {isLoading ? (
            <KidCard tone="cream" className="!p-16 text-center">
              <Loader2 className="w-7 h-7 text-terracotta animate-spin mx-auto" />
            </KidCard>
          ) : items.length === 0 ? (
            <EmptyState
              illustration="empty-scholarships"
              title="No open scholarships"
              body={t('scholarship.empty') ?? 'New scholarships will appear here as sponsors mint them.'}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {items.map((s) => (
                <ScholarshipCard
                  key={s.id}
                  item={s}
                  language={language}
                  t={t}
                  myApp={myAppByScholarship[s.id]}
                  onApply={() => setApplyTarget(s)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {applyTarget && (
        <ApplyModal
          scholarship={applyTarget}
          onClose={() => setApplyTarget(null)}
          onSuccess={(application) => onApplied(applyTarget.id, application)}
        />
      )}
    </div>
  );
}

const APP_STATUS_BADGE: Record<MyApplication['status'], string> = {
  pending: 'bg-mustard/15 text-mustard-500 border-amber-200',
  approved: 'bg-forest/10 text-forest-500 border-forest/30',
  rejected: 'bg-coral/10 text-coral border-coral/30',
  funded: 'bg-terracotta/10 text-terracotta-500 border-terracotta/30',
  withdrawn: 'bg-cream-100 text-espresso/70 border-espresso/15',
};

const ScholarshipCard = ({
  item,
  language,
  t,
  myApp,
  onApply,
}: {
  item: Scholarship;
  language: string;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  myApp?: MyApplication;
  onApply: () => void;
}) => {
  const slotsLeft = Math.max(0, (item.slots_available || 0) - (item.slots_filled || 0));
  const perSlot =
    Math.max(1, item.slots_available || 1) > 0
      ? (item.total_amount_lkr || 0) / Math.max(1, item.slots_available || 1)
      : 0;
  const alreadyApplied = !!myApp && !['withdrawn', 'rejected'].includes(myApp.status);
  const eligible =
    Array.isArray(item.target_disability_types) && item.target_disability_types.length > 0;

  return (
    <KidCard tone="cream" sticker>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-xl font-bold text-espresso leading-tight">
            {item.title}
          </h3>
          {item.description && (
            <p className="text-sm text-espresso/70 mt-2 line-clamp-3">
              {item.description}
            </p>
          )}
        </div>
        {eligible && !myApp && (
          <TagPill tone="mustard" icon={<Sparkles className="w-3 h-3" />}>
            {t('scholarship.maybeEligible')}
          </TagPill>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Detail label={t('scholarship.amount')} value={formatCurrency(perSlot, { locale: language })} />
        <Detail label={t('scholarship.slots')}  value={`${slotsLeft}/${item.slots_available}`} />
        {item.target_locations?.length > 0 && (
          <Detail label={t('scholarship.locations')} value={item.target_locations.join(', ')} icon={<MapPin className="w-3.5 h-3.5" />} />
        )}
        {item.target_disability_types?.length > 0 && (
          <Detail label={t('scholarship.disabilityTargeting')} value={item.target_disability_types.join(', ')} icon={<Users className="w-3.5 h-3.5" />} />
        )}
      </dl>

      <div className="mt-5 flex items-center justify-end gap-2">
        {myApp && (
          <TagPill tone={myApp.status === 'approved' || myApp.status === 'funded' ? 'forest' : myApp.status === 'rejected' ? 'terracotta' : 'mustard'} icon={<CheckCircle2 className="w-3 h-3" />}>
            {t(`scholarship.application.status.${myApp.status}`)}
          </TagPill>
        )}
        <button
          onClick={onApply}
          disabled={alreadyApplied || slotsLeft === 0}
          className="btn-kid-primary !py-2 !px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
        >
          {alreadyApplied
            ? t(`scholarship.application.status.${myApp!.status}`)
            : t('scholarship.apply')}
        </button>
      </div>
    </KidCard>
  );
};

const Detail = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-espresso/55 flex items-center gap-1">
      {icon}
      {label}
    </dt>
    <dd className="mt-0.5 font-medium text-espresso truncate">{value}</dd>
  </div>
);

const ApplyModal = ({
  scholarship,
  onClose,
  onSuccess,
}: {
  scholarship: Scholarship;
  onClose: () => void;
  onSuccess: (application: MyApplication) => void;
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    statement_of_need: '',
    family_income_lkr: '',
    school: '',
    grade: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!form.statement_of_need.trim()) {
      setError(t('form.fieldRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        statement_of_need: form.statement_of_need.trim(),
        family_income_lkr: form.family_income_lkr
          ? Number(form.family_income_lkr)
          : undefined,
        school: form.school.trim() || undefined,
        grade: form.grade.trim() || undefined,
      };
      const result = await apiClient.applyToScholarship(scholarship.id, payload);
      setSuccess(true);
      setTimeout(() => {
        onSuccess(result?.application as MyApplication);
      }, 1100);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-2xl bg-cream-50 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-start justify-between border-b border-espresso/10 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-espresso">
              {t('scholarship.apply.heading')}
            </h2>
            <p className="text-sm text-espresso/55 mt-0.5">{scholarship.title}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-espresso/45 hover:text-espresso/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-forest/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-forest" />
            </div>
            <h3 className="text-lg font-bold text-espresso">
              {t('scholarship.apply.successTitle')}
            </h3>
            <p className="text-sm text-espresso/70 mt-2 max-w-sm mx-auto">
              {t('scholarship.apply.successBody')}
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <Field label={t('scholarship.application.statementOfNeed')} required>
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={form.statement_of_need}
                    onChange={(e) =>
                      setForm({ ...form, statement_of_need: e.target.value })
                    }
                    placeholder=""
                    className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
                  />
                  {}
                  <DictateButton
                    value={form.statement_of_need}
                    onChange={(next) =>
                      setForm({ ...form, statement_of_need: next })
                    }
                    compact={false}
                  />
                </div>
              </Field>
              <Field label={t('scholarship.application.familyIncome')}>
                <input
                  type="number"
                  min={0}
                  value={form.family_income_lkr}
                  onChange={(e) =>
                    setForm({ ...form, family_income_lkr: e.target.value })
                  }
                  className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t('scholarship.application.school')}>
                  <input
                    type="text"
                    value={form.school}
                    onChange={(e) => setForm({ ...form, school: e.target.value })}
                    className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
                  />
                </Field>
                <Field label={t('scholarship.application.grade')}>
                  <input
                    type="text"
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
                  />
                </Field>
              </div>
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
                onClick={submit}
                disabled={submitting}
                className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-400 disabled:opacity-60"
              >
                {submitting ? t('auth.processing') : t('scholarship.apply')}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="block text-sm font-medium text-espresso mb-1">
      {label}
      {required && <span className="text-forest ml-0.5">*</span>}
    </span>
    {children}
  </label>
);

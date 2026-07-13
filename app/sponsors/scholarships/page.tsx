'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Award,
  Plus,
  Loader2,
  Users,
  Calendar,
  X,
  Eye,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

interface Scholarship {
  id: string;
  title: string;
  description?: string;
  total_amount_lkr: number;
  slots_available: number;
  slots_filled: number;
  status: 'draft' | 'open' | 'closed' | 'archived';
  target_disability_types: string[];
  target_locations: string[];
  eligibility_criteria: Record<string, any>;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-cream-100 text-espresso',
  open: 'bg-forest/15 text-forest-500',
  closed: 'bg-mustard/20 text-mustard-500',
  archived: 'bg-cream-300 text-espresso/55',
};

export default function SponsorScholarshipsPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [items, setItems] = useState<Scholarship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Sponsor'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    if (currentUser?.role !== 'sponsor') {
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
      const result = await apiClient.listMyScholarships();
      setItems(result?.scholarships || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load scholarships.');
    } finally {
      setIsLoading(false);
    }
  };

  const totals = useMemo(() => {
    const open = items.filter((i) => i.status === 'open');
    const totalBudget = items.reduce((sum, i) => sum + (i.total_amount_lkr || 0), 0);
    const slotsFilled = items.reduce((sum, i) => sum + (i.slots_filled || 0), 0);
    const slotsAvailable = items.reduce((sum, i) => sum + (i.slots_available || 0), 0);
    return { openCount: open.length, totalBudget, slotsFilled, slotsAvailable };
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
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-espresso flex items-center gap-3">
                <Award className="h-8 w-8 text-mustard-500" />
                {t('scholarship.title')}
              </h1>
              <p className="text-espresso/70 mt-1">
                {t('scholarship.openCount', {
                  n: totals.openCount,
                  filled: totals.slotsFilled,
                  slots: totals.slotsAvailable,
                })}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-mustard-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('scholarship.create')}
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <SummaryTile
              label={t('scholarship.budget')}
              value={formatCurrency(totals.totalBudget, { locale: language, compact: true })}
              icon={<Award className="w-5 h-5" />}
              accent="rose"
            />
            <SummaryTile
              label={t('scholarship.status.open')}
              value={String(totals.openCount)}
              icon={<CheckCircle2 className="w-5 h-5" />}
              accent="green"
            />
            <SummaryTile
              label={t('scholarship.slots')}
              value={`${totals.slotsFilled}/${totals.slotsAvailable}`}
              icon={<Users className="w-5 h-5" />}
              accent="blue"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-mustard-500 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-espresso/20 bg-cream-50 py-16 text-center">
              <Award className="mx-auto h-10 w-10 text-espresso/30 mb-3" />
              <p className="text-espresso/70">{t('scholarship.empty')}</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 rounded-lg bg-mustard-400 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('scholarship.create')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {items.map((s) => (
                <ScholarshipCard key={s.id} item={s} t={t} language={language} />
              ))}
            </div>
          )}
        </main>
      </div>

      {showCreate && (
        <CreateScholarshipModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setItems((prev) => [created, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

const SummaryTile = ({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: 'rose' | 'green' | 'blue';
}) => {
  const tone =
    accent === 'rose'
      ? 'bg-mustard/15 text-mustard-500'
      : accent === 'green'
        ? 'bg-forest/10 text-forest-500'
        : 'bg-terracotta/10 text-terracotta-500';
  return (
    <div className="rounded-2xl bg-cream-50 border border-espresso/10 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-espresso/55">{label}</span>
        <span className={`p-2 rounded-lg ${tone}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-espresso mt-2">{value}</p>
    </div>
  );
};

const ScholarshipCard = ({
  item,
  t,
  language,
}: {
  item: Scholarship;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  language: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-cream-50 border border-espresso/10 shadow-sm hover:shadow-md transition-shadow p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-espresso truncate">
            {item.title}
          </h3>
          {item.description && (
            <p className="text-sm text-espresso/70 mt-1 line-clamp-2">
              {item.description}
            </p>
          )}
        </div>
        <span
          className={`flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] || 'bg-cream-100 text-espresso'}`}
        >
          {t(`scholarship.status.${item.status}`)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Detail
          label={t('scholarship.budget')}
          value={formatCurrency(item.total_amount_lkr, { locale: language })}
        />
        <Detail
          label={t('scholarship.slots')}
          value={t('scholarship.slotsAvailable', {
            filled: item.slots_filled,
            slots: item.slots_available,
          })}
        />
        {item.target_disability_types?.length > 0 && (
          <Detail
            label={t('scholarship.disabilityTargeting')}
            value={item.target_disability_types.join(', ')}
          />
        )}
        {item.target_locations?.length > 0 && (
          <Detail
            label={t('scholarship.locations')}
            value={item.target_locations.join(', ')}
          />
        )}
      </dl>

      <div className="mt-4 flex justify-end">
        <Link
          href={`/sponsors/scholarships/${item.id}/applications`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-mustard-500 hover:text-rose-800"
        >
          <Eye className="w-4 h-4" />
          {t('scholarship.viewApplications')}
        </Link>
      </div>
    </motion.div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-espresso/55">{label}</dt>
    <dd className="mt-0.5 font-medium text-espresso">{value}</dd>
  </div>
);


const CreateScholarshipModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: Scholarship) => void;
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: '',
    description: '',
    total_amount_lkr: 0,
    slots_available: 5,
    target_disability_types: '',
    target_locations: '',
    max_family_income_lkr: '',
    min_grade: '',
    max_grade: '',
    start_date: '',
    end_date: '',
    publishNow: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim() || form.total_amount_lkr <= 0) {
      setError(t('form.fieldRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const eligibility: Record<string, any> = {};
      if (form.max_family_income_lkr)
        eligibility.max_family_income_lkr = Number(form.max_family_income_lkr);
      if (form.min_grade) eligibility.min_grade = form.min_grade;
      if (form.max_grade) eligibility.max_grade = form.max_grade;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        total_amount_lkr: Number(form.total_amount_lkr),
        slots_available: Number(form.slots_available) || 1,
        target_disability_types: form.target_disability_types
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        target_locations: form.target_locations
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        eligibility_criteria: eligibility,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        status: form.publishNow ? 'open' : 'draft',
      };
      const result = await apiClient.createScholarship(payload);
      onCreated(result.scholarship as Scholarship);
    } catch (err: any) {
      setError(err?.message || 'Failed to create scholarship.');
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
              {t('scholarship.create.heading')}
            </h2>
            <p className="text-sm text-espresso/55 mt-0.5">
              {t('scholarship.create.subtitle')}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-espresso/45 hover:text-espresso/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <Field label={t('scholarship.field.title')} required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </Field>
          <Field label={t('scholarship.field.description')}>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('scholarship.field.totalAmount')} required>
              <input
                type="number"
                min={0}
                value={form.total_amount_lkr}
                onChange={(e) =>
                  setForm({ ...form, total_amount_lkr: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
            <Field label={t('scholarship.field.slots')} required>
              <input
                type="number"
                min={1}
                value={form.slots_available}
                onChange={(e) =>
                  setForm({ ...form, slots_available: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
          </div>
          <Field label={t('scholarship.field.disabilityTypes')}>
            <input
              type="text"
              value={form.target_disability_types}
              onChange={(e) =>
                setForm({ ...form, target_disability_types: e.target.value })
              }
              placeholder="visual, hearing, motor"
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </Field>
          <Field label={t('scholarship.field.locations')}>
            <input
              type="text"
              value={form.target_locations}
              onChange={(e) => setForm({ ...form, target_locations: e.target.value })}
              placeholder="Colombo, Jaffna, Kandy"
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('scholarship.field.maxIncome')}>
              <input
                type="number"
                min={0}
                value={form.max_family_income_lkr}
                onChange={(e) =>
                  setForm({ ...form, max_family_income_lkr: e.target.value })
                }
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
            <Field label={t('scholarship.field.minGrade')}>
              <input
                type="text"
                value={form.min_grade}
                onChange={(e) => setForm({ ...form, min_grade: e.target.value })}
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
            <Field label={t('scholarship.field.maxGrade')}>
              <input
                type="text"
                value={form.max_grade}
                onChange={(e) => setForm({ ...form, max_grade: e.target.value })}
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('scholarship.field.startDate')}>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
            <Field label={t('scholarship.field.endDate')}>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-espresso">
            <input
              type="checkbox"
              checked={form.publishNow}
              onChange={(e) => setForm({ ...form, publishNow: e.target.checked })}
              className="rounded border-espresso/20 text-mustard-500 focus:ring-rose-500"
            />
            {t('scholarship.field.publishNow')}
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
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-mustard-400 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {submitting
              ? t('auth.processing')
              : form.publishNow
                ? t('scholarship.publish')
                : t('scholarship.saveDraft')}
          </button>
        </div>
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
      {required && <span className="text-mustard-500 ml-0.5">*</span>}
    </span>
    {children}
  </label>
);

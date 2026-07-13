'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Award,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Wallet,
  Hourglass,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

interface MyApplication {
  id: string;
  scholarship_id: string;
  scholarship_title?: string | null;
  scholarship_status?: string | null;
  statement_of_need?: string | null;
  family_income_lkr?: number | null;
  school?: string | null;
  grade?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'funded' | 'withdrawn';
  reviewer_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

interface Grant {
  id: string;
  scholarship_application_id?: string | null;
  amount_lkr: number;
  status: 'available' | 'used' | 'expired' | 'revoked';
  applies_to_session_id?: string | null;
  applies_to_course_id?: string | null;
  used_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

const APP_BADGE: Record<MyApplication['status'], string> = {
  pending: 'bg-mustard/15 text-mustard-500 border-amber-200',
  approved: 'bg-forest/10 text-forest-500 border-forest/30',
  rejected: 'bg-coral/10 text-coral border-coral/30',
  funded: 'bg-terracotta/10 text-terracotta-500 border-terracotta/30',
  withdrawn: 'bg-cream-100 text-espresso/70 border-espresso/15',
};

const APP_ICON: Record<MyApplication['status'], React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5" />,
  approved: <CheckCircle2 className="w-3.5 h-3.5" />,
  rejected: <XCircle className="w-3.5 h-3.5" />,
  funded: <Sparkles className="w-3.5 h-3.5" />,
  withdrawn: <XCircle className="w-3.5 h-3.5" />,
};

const GRANT_BADGE: Record<Grant['status'], string> = {
  available: 'bg-forest/10 text-forest-500 border-forest/30',
  used: 'bg-terracotta/10 text-terracotta-500 border-terracotta/30',
  expired: 'bg-cream-100 text-espresso/55 border-espresso/15',
  revoked: 'bg-coral/10 text-coral border-coral/30',
};

export default function StudentMyApplicationsPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const [appsResult, grantsResult] = await Promise.all([
        apiClient.listMyScholarshipApplications(),
        apiClient.listMyFundingGrants().catch(() => ({ grants: [] })),
      ]);
      setApplications((appsResult?.applications as MyApplication[]) || []);
      setGrants((grantsResult?.grants as Grant[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load applications.');
    } finally {
      setIsLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, funded: 0 };
    for (const a of applications) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [applications]);

  const availableGrantTotal = useMemo(() => {
    return grants
      .filter((g) => g.status === 'available')
      .reduce((sum, g) => sum + (g.amount_lkr || 0), 0);
  }, [grants]);

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
          <Link
            href="/students/scholarships"
            className="inline-flex items-center gap-1 text-sm text-espresso/70 hover:text-espresso mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('scholarship.browse')}
          </Link>

          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-espresso flex items-center gap-3">
                <Award className="h-8 w-8 text-forest" />
                {t('scholarship.myApplications')}
              </h1>
              <p className="text-espresso/70 mt-1">
                {applications.length} · {grants.length}{' '}
                <span className="text-espresso/45">·</span>{' '}
                {formatCurrency(availableGrantTotal, { locale: language })}
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <CountTile
              label={t('scholarship.application.status.pending')}
              value={counts.pending}
              icon={<Clock className="w-4 h-4" />}
              accent="amber"
            />
            <CountTile
              label={t('scholarship.application.status.approved')}
              value={counts.approved}
              icon={<CheckCircle2 className="w-4 h-4" />}
              accent="green"
            />
            <CountTile
              label={t('scholarship.application.status.rejected')}
              value={counts.rejected}
              icon={<XCircle className="w-4 h-4" />}
              accent="red"
            />
            <CountTile
              label={t('scholarship.application.status.funded')}
              value={counts.funded + (counts.approved || 0)}
              icon={<Sparkles className="w-4 h-4" />}
              accent="blue"
            />
          </div>

          {}
          {grants.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold text-espresso flex items-center gap-2 mb-3">
                <Wallet className="w-5 h-5 text-forest" />
                {t('scholarship.application.grantAmount')}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {grants.map((grant) => (
                  <GrantCard key={grant.id} grant={grant} language={language} t={t} />
                ))}
              </div>
            </section>
          )}

          <h2 className="text-lg font-bold text-espresso flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-forest" />
            {t('scholarship.application.queue')}
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-forest animate-spin" />
            </div>
          ) : applications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-espresso/20 bg-cream-50 py-16 text-center">
              <Award className="mx-auto h-10 w-10 text-espresso/30 mb-3" />
              <p className="text-espresso/70">{t('scholarship.application.empty')}</p>
              <Link
                href="/students/scholarships"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-400"
              >
                {t('scholarship.browse')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <ApplicationRow key={app.id} app={app} language={language} t={t} />
              ))}
            </div>
          )}
        </main>
      </div>
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
  accent: 'amber' | 'green' | 'red' | 'blue';
}) => {
  const tone =
    accent === 'amber'
      ? 'bg-mustard/15 text-mustard-500'
      : accent === 'green'
        ? 'bg-forest/10 text-forest-500'
        : accent === 'red'
          ? 'bg-coral/10 text-coral'
          : 'bg-terracotta/10 text-terracotta-500';
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

const GrantCard = ({
  grant,
  language,
  t,
}: {
  grant: Grant;
  language: string;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
}) => {
  const expiresAt = grant.expires_at ? new Date(grant.expires_at) : null;
  const expiresSoon =
    expiresAt &&
    grant.status === 'available' &&
    expiresAt.getTime() - Date.now() < 1000 * 60 * 60 * 24 * 14;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-cream-50 border border-espresso/10 p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-espresso">
            {formatCurrency(grant.amount_lkr, { locale: language })}
          </p>
          <p className="text-xs text-espresso/55 mt-1">
            {new Date(grant.created_at).toLocaleDateString(language)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${GRANT_BADGE[grant.status]}`}
        >
          {grant.status === 'available' ? (
            <Sparkles className="w-3 h-3" />
          ) : grant.status === 'used' ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : grant.status === 'expired' ? (
            <Hourglass className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          {t(`grant.status.${grant.status}`)}
        </span>
      </div>

      {expiresAt && (
        <p
          className={`mt-3 inline-flex items-center gap-1 text-xs ${
            expiresSoon ? 'text-mustard-500' : 'text-espresso/55'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {expiresSoon ? t('grant.expiresSoon') : t('grant.expires')}{' '}
          {expiresAt.toLocaleDateString(language)}
        </p>
      )}

      {grant.status === 'available' && (
        <Link
          href="/students/live-sessions"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-500 hover:text-forest-500"
        >
          {t('grant.useNow')}
        </Link>
      )}
    </motion.div>
  );
};

const ApplicationRow = ({
  app,
  language,
  t,
}: {
  app: MyApplication;
  language: string;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-cream-50 border border-espresso/10 p-4 shadow-sm hover:shadow transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-espresso truncate">
            {app.scholarship_title || app.scholarship_id.slice(0, 8)}
          </h3>
          <p className="text-xs text-espresso/55 mt-0.5">
            {new Date(app.created_at).toLocaleDateString(language)}
          </p>
          {app.statement_of_need && (
            <p className="mt-2 text-sm text-espresso line-clamp-2">
              {app.statement_of_need}
            </p>
          )}
          {app.reviewer_notes && app.status !== 'pending' && (
            <div className="mt-3 rounded-lg bg-cream-100 border border-espresso/10 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-wide text-espresso/55 mb-0.5">
                {t('scholarship.application.reviewerNotes')}
              </p>
              <p className="text-espresso">{app.reviewer_notes}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${APP_BADGE[app.status]}`}
          >
            {APP_ICON[app.status]}
            {t(`scholarship.application.status.${app.status}`)}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Ticket,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

export default function RedeemCodePage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ value_lkr: number } | null>(null);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Student'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'student') {
      router.push('/auth');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) {
      setError(t('form.fieldRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.redeemAccessCode(cleaned);
      setSuccess({ value_lkr: result?.value_lkr ?? 0 });
    } catch (err: any) {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('not recognized')) setError(t('redeem.error.invalid'));
      else if (raw.includes('expired')) setError(t('redeem.error.expired'));
      else if (raw.includes('fully redeemed')) setError(t('redeem.error.exhausted'));
      else if (raw.includes('already redeemed')) setError(t('redeem.error.alreadyUsed'));
      else setError(err?.message || t('error.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setCode('');
    setSuccess(null);
    setError(null);
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
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-espresso flex items-center gap-3">
              <Ticket className="h-8 w-8 text-forest" />
              {t('redeem.title')}
            </h1>
            <p className="text-espresso/70 mt-2 mb-8">{t('redeem.subtitle')}</p>

            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-cream-50 border border-forest/30 shadow-sm p-8 text-center"
              >
                <div className="mx-auto h-16 w-16 rounded-full bg-forest/15 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-9 w-9 text-forest" />
                </div>
                <h2 className="text-2xl font-bold text-espresso">
                  {t('redeem.successTitle')}
                </h2>
                <p className="text-espresso/70 mt-2">
                  {t('redeem.successBody', {
                    value: formatCurrency(success.value_lkr, { locale: language }),
                  })}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-3 py-1 text-sm font-semibold text-forest-500">
                  <Sparkles className="w-4 h-4" />
                  {formatCurrency(success.value_lkr, { locale: language })}
                </div>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    onClick={reset}
                    className="rounded-lg border border-espresso/20 bg-cream-50 px-4 py-2 text-sm font-medium text-espresso hover:bg-cream-100"
                  >
                    {t('redeem.submit')}
                  </button>
                  <Link
                    href="/students/scholarships/applications"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-400"
                  >
                    {t('scholarship.myApplications')}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            ) : (
              <form
                onSubmit={submit}
                className="rounded-2xl bg-cream-50 border border-espresso/10 shadow-sm p-6 space-y-5"
              >
                <label className="block">
                  <span className="block text-sm font-medium text-espresso mb-1">
                    {t('redeem.field.code')}
                    <span className="text-forest ml-0.5">*</span>
                  </span>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="ABCD2EFG34"
                    className="w-full rounded-lg border border-espresso/20 px-3 py-3 font-mono uppercase tracking-widest focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none"
                  />
                </label>

                {error && (
                  <div role="alert" className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !code.trim()}
                  className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-semibold text-white hover:bg-forest-400 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('auth.processing')}
                    </>
                  ) : (
                    <>
                      <Ticket className="w-4 h-4" />
                      {t('redeem.submit')}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Gift,
  Plus,
  Loader2,
  Copy,
  Check,
  Trash2,
  X,
  AlertCircle,
  Ticket,
  Calendar,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';

interface AccessCode {
  id: string;
  sponsor_id: string;
  code: string;
  value_lkr: number;
  max_uses: number;
  uses: number;
  label?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export default function SponsorAccessCodesPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [items, setItems] = useState<AccessCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
  }, []);

  const fetchAll = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await apiClient.listMyAccessCodes();
      setItems(result?.access_codes || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load access codes.');
    } finally {
      setIsLoading(false);
    }
  };

  const totals = useMemo(() => {
    const totalValue = items.reduce((sum, c) => sum + (c.value_lkr || 0) * (c.max_uses || 1), 0);
    const totalRedeemed = items.reduce((sum, c) => sum + (c.uses || 0), 0);
    const active = items.filter((c) => (c.uses || 0) < (c.max_uses || 1)).length;
    return { totalValue, totalRedeemed, active };
  }, [items]);

  const onCopy = async (code: AccessCode) => {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopiedId(code.id);
      setTimeout(() => setCopiedId((prev) => (prev === code.id ? null : prev)), 1500);
    } catch {
    }
  };

  const onRevoke = async (code: AccessCode) => {
    if (!confirm(`${t('accessCode.revoke')}: ${code.code}?`)) return;
    try {
      await apiClient.revokeAccessCode(code.id);
      setItems((prev) => prev.filter((c) => c.id !== code.id));
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke code.');
    }
  };

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
                <Gift className="h-8 w-8 text-mustard-500" />
                {t('accessCode.title')}
              </h1>
              <p className="text-espresso/70 mt-1">{t('accessCode.subtitle')}</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-mustard-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('accessCode.generate')}
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <SummaryTile
              label={t('accessCode.value')}
              value={formatCurrency(totals.totalValue, { locale: language, compact: true })}
              icon={<Gift className="w-5 h-5" />}
              accent="rose"
            />
            <SummaryTile
              label={t('accessCode.usesColumn')}
              value={String(totals.totalRedeemed)}
              icon={<Ticket className="w-5 h-5" />}
              accent="green"
            />
            <SummaryTile
              label={t('scholarship.status.open')}
              value={String(totals.active)}
              icon={<Check className="w-5 h-5" />}
              accent="blue"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 text-mustard-500 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-espresso/20 bg-cream-50 py-16 text-center">
              <Gift className="mx-auto h-10 w-10 text-espresso/30 mb-3" />
              <p className="text-espresso/70">{t('accessCode.empty')}</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 rounded-lg bg-mustard-400 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('accessCode.generate')}
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-espresso/10 bg-cream-50 shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-cream-100 text-xs uppercase tracking-wide text-espresso/55">
                  <tr>
                    <th className="px-4 py-3">{t('accessCode.codeColumn')}</th>
                    <th className="px-4 py-3">{t('accessCode.valueColumn')}</th>
                    <th className="px-4 py-3">{t('accessCode.usesColumn')}</th>
                    <th className="px-4 py-3">{t('accessCode.label')}</th>
                    <th className="px-4 py-3">{t('accessCode.expiresAt')}</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-espresso/10 text-sm">
                  {items.map((code) => (
                    <CodeRow
                      key={code.id}
                      code={code}
                      language={language}
                      copied={copiedId === code.id}
                      onCopy={() => onCopy(code)}
                      onRevoke={() => onRevoke(code)}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {showCreate && (
        <CreateCodesModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setItems((prev) => [...created, ...prev]);
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

const CodeRow = ({
  code,
  language,
  copied,
  onCopy,
  onRevoke,
  t,
}: {
  code: AccessCode;
  language: string;
  copied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
}) => {
  const exhausted = (code.uses || 0) >= (code.max_uses || 1);
  return (
    <tr className={exhausted ? 'bg-cream-100/60' : ''}>
      <td className="px-4 py-3 font-mono font-semibold tracking-wider text-espresso">
        {code.code}
      </td>
      <td className="px-4 py-3 text-espresso">
        {formatCurrency(code.value_lkr, { locale: language })}
      </td>
      <td className="px-4 py-3 text-espresso">
        <span className={exhausted ? 'text-espresso/45' : 'text-espresso'}>
          {code.uses}/{code.max_uses}
        </span>
      </td>
      <td className="px-4 py-3 text-espresso/55">{code.label || '—'}</td>
      <td className="px-4 py-3 text-espresso/55">
        {code.expires_at
          ? new Date(code.expires_at).toLocaleDateString(language)
          : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-espresso/15 bg-cream-50 px-2.5 py-1.5 text-xs font-medium text-espresso hover:bg-cream-100"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-forest" />
                {t('accessCode.copied')}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {t('accessCode.copy')}
              </>
            )}
          </button>
          <button
            onClick={onRevoke}
            className="inline-flex items-center gap-1.5 rounded-md border border-coral/30 bg-cream-50 px-2.5 py-1.5 text-xs font-medium text-coral hover:bg-coral/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('accessCode.revoke')}
          </button>
        </div>
      </td>
    </tr>
  );
};

const CreateCodesModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: AccessCode[]) => void;
}) => {
  const { t, language } = useTranslation();
  const [form, setForm] = useState({
    value_lkr: 1000,
    quantity: 10,
    max_uses: 1,
    label: '',
    expires_at: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AccessCode[] | null>(null);

  const submit = async () => {
    if (form.value_lkr <= 0 || form.quantity < 1) {
      setError(t('form.fieldRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        value_lkr: Number(form.value_lkr),
        quantity: Number(form.quantity),
        max_uses: Number(form.max_uses) || 1,
        label: form.label.trim() || undefined,
        expires_at: form.expires_at
          ? new Date(form.expires_at).toISOString()
          : undefined,
      };
      const result = await apiClient.createAccessCodes(payload);
      setCreated(result?.access_codes || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate codes.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeAndPropagate = () => {
    if (created && created.length) {
      onCreated(created);
    } else {
      onClose();
    }
  };

  if (created && created.length) {
    const joined = created.map((c) => c.code).join('\n');
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg rounded-2xl bg-cream-50 shadow-2xl overflow-hidden"
        >
          <div className="flex items-start justify-between border-b border-espresso/10 px-6 py-4">
            <div>
              <h2 className="text-xl font-bold text-espresso">
                {created.length} × {t('accessCode.codeColumn')}
              </h2>
              <p className="text-sm text-espresso/55 mt-0.5">
                {formatCurrency(created[0].value_lkr, { locale: language })}
                {created[0].label ? ` · ${created[0].label}` : ''}
              </p>
            </div>
            <button onClick={closeAndPropagate} className="rounded-md p-1 text-espresso/45 hover:text-espresso/70">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-4">
            <pre className="max-h-72 overflow-y-auto whitespace-pre rounded-lg border border-espresso/15 bg-cream-100 p-3 font-mono text-sm text-espresso">
              {joined}
            </pre>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-espresso/10 px-6 py-4">
            <button
              onClick={() => navigator.clipboard.writeText(joined)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-espresso/20 bg-cream-50 px-4 py-2 text-sm font-medium text-espresso hover:bg-cream-100"
            >
              <Copy className="w-4 h-4" />
              {t('accessCode.copy')}
            </button>
            <button
              onClick={closeAndPropagate}
              className="rounded-lg bg-mustard-400 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              {t('common.close')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl bg-cream-50 shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between border-b border-espresso/10 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-espresso">
              {t('accessCode.generate')}
            </h2>
            <p className="text-sm text-espresso/55 mt-0.5">
              {t('accessCode.subtitle')}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-espresso/45 hover:text-espresso/70">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('accessCode.value')} required>
              <input
                type="number"
                min={0}
                value={form.value_lkr}
                onChange={(e) => setForm({ ...form, value_lkr: Number(e.target.value) })}
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
            <Field label={t('accessCode.quantity')} required>
              <input
                type="number"
                min={1}
                max={500}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </Field>
          </div>
          <Field label={t('accessCode.maxUses')}>
            <input
              type="number"
              min={1}
              max={1000}
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })}
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </Field>
          <Field label={t('accessCode.label')}>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Jaffna outreach 2026"
              className="w-full rounded-lg border border-espresso/20 px-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
            />
          </Field>
          <Field label={t('accessCode.expiresAt')}>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-espresso/45" />
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full rounded-lg border border-espresso/20 pl-9 pr-3 py-2 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </div>
          </Field>
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
            {submitting ? t('auth.processing') : t('accessCode.generate')}
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

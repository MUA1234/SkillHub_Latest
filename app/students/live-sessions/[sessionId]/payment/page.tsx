'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/hooks/use-translation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Info,
  Landmark,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';

type CheckoutStep = 'review' | 'method' | 'processing' | 'success';
type PaymentMethod = 'payhere' | 'card';

interface SessionDetails {
  id: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  recording_enabled?: boolean;
}

interface DemoPayment {
  id?: string;
  transaction_id?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  payment_method?: string;
  payment_gateway?: string;
}

const STEP_ORDER: CheckoutStep[] = ['review', 'method', 'processing', 'success'];

/**
 * Step 3 plays a 2-stage progress animation that maps onto the two POST
 * lifecycle phases of a real gateway (auth → capture). The total runtime is
 * tuned so a reviewer sees the messages without feeling a stall — short
 * enough that a slow click-through still feels responsive.
 */
const STAGE_1_MS = 1100;
const STAGE_2_MS = 1300;

/**
 * Map a CheckoutStep to a translation key for the stepper label.
 */
const STEP_LABELS: Record<CheckoutStep, string> = {
  review: 'payment.step.review',
  method: 'payment.step.method',
  processing: 'payment.step.processing',
  success: 'payment.step.success',
};

const SessionPaymentPage = () => {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useTranslation();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<CheckoutStep>('review');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('payhere');
  const [processingStage, setProcessingStage] = useState<1 | 2>(1);
  const [completedPayment, setCompletedPayment] = useState<DemoPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligibleGrants, setEligibleGrants] = useState<any[]>([]);

  const currentUser = getCurrentUser();
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Student'}`.trim();
  const userEmail = currentUser?.email || 'demo@student.com';

  const sessionPrice = session?.price ?? 0;
  const sessionCurrency = (session?.currency || 'LKR').toUpperCase();
  const formattedTotal = useMemo(
    () => formatCurrency(sessionPrice, { currency: sessionCurrency, locale: language }),
    [sessionPrice, sessionCurrency, language],
  );

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    fetchSessionDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchSessionDetails = async () => {
    try {
      setIsLoading(true);
      const token =
        (typeof window !== 'undefined' && localStorage.getItem('access_token')) ||
        (typeof window !== 'undefined' && localStorage.getItem('token')) ||
        '';
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/teachers/sessions/${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch session details');
      }
      const data = await response.json();
      setSession(data);

      const price = Number(data?.price ?? 0);
      try {
        const grantsResp = await apiClient.listMyFundingGrants();
        const grants = Array.isArray(grantsResp?.grants) ? grantsResp.grants : [];
        const eligible = grants.filter(
          (g: any) =>
            g?.status === 'available' && Number(g?.amount_lkr ?? 0) >= price,
        );
        setEligibleGrants(eligible);
      } catch {
        setEligibleGrants([]);
      }
    } catch (err) {
      console.error('Error loading session:', err);
      setError(t('error.generic'));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * E4 grant path. Mirrors submitPayment's processing-step orchestration
   * but POSTs to /payments/scholarship-grant instead of the demo gateway.
   * Reuses the same success-screen wiring so payment-history etc. handle
   * the resulting row identically.
   */
  const submitGrantPayment = async (grantId: string) => {
    setStep('processing');
    setProcessingStage(1);
    setError(null);

    const stage1 = new Promise<void>((resolve) => setTimeout(resolve, STAGE_1_MS));
    const stage2 = new Promise<void>((resolve) =>
      setTimeout(resolve, STAGE_1_MS + STAGE_2_MS),
    );
    stage1.then(() => setProcessingStage(2));

    try {
      const [result] = await Promise.all([
        apiClient.consumeGrantForSession(sessionId, grantId),
        stage2,
      ]);
      setCompletedPayment(
        (result?.payment as DemoPayment) || {
          payment_method: 'scholarship_grant',
          payment_gateway: 'scholarship',
        },
      );
      setStep('success');
    } catch (err: any) {
      console.error('Grant payment error:', err);
      setError(err?.message || t('payment.error.title'));
      setStep('method');
    }
  };

  /**
   * Drive the processing animation and call the demo payment endpoint in
   * parallel. We deliberately wait for both the simulated timer AND the API
   * response before showing the success screen — this way the reviewer
   * always sees the two-stage progress play out, but a real backend error
   * never gets hidden behind a "success" frame.
   */
  const submitPayment = async () => {
    setStep('processing');
    setProcessingStage(1);
    setError(null);

    const token =
      (typeof window !== 'undefined' && localStorage.getItem('access_token')) ||
      (typeof window !== 'undefined' && localStorage.getItem('token')) ||
      '';

    const stage1 = new Promise<void>((resolve) => setTimeout(resolve, STAGE_1_MS));
    const stage2 = new Promise<void>((resolve) =>
      setTimeout(resolve, STAGE_1_MS + STAGE_2_MS),
    );

    stage1.then(() => setProcessingStage(2));

    const apiCall = fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/sessions/${sessionId}/payment`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payment_method: paymentMethod }),
      },
    );

    try {
      const [response] = await Promise.all([apiCall, stage2]);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.detail || t('payment.error.title'));
      }
      const data = await response.json();
      setCompletedPayment(data?.payment || null);
      setStep('success');
    } catch (err: any) {
      console.error('Demo payment error:', err);
      setError(err?.message || t('payment.error.title'));
      setStep('method');
    }
  };

  const goToStep = (next: CheckoutStep) => setStep(next);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation
          userRole="student"
          userName={userName}
          userEmail={userEmail}
        />
        <div className="flex pt-16">
          <DashboardSidebar userRole="student" />
          <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)]">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-terracotta mx-auto mb-4" />
              <p className="text-espresso/70">{t('common.loading')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole="student"
        userName={userName}
        userEmail={userEmail}
      />
      <div className="flex pt-16">
        <DashboardSidebar userRole="student" />
        <main className="flex-1 py-6 pb-12 min-h-[calc(100vh-4rem)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {}
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-mustard/15 px-4 py-3 text-amber-900"
          >
            <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-mustard-500" />
            <p className="text-sm leading-relaxed">{t('payment.demo.banner')}</p>
          </div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <button
              type="button"
              onClick={() => router.push('/students/live-sessions')}
              className="flex items-center text-sm text-espresso/70 hover:text-espresso mb-3 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {t('payment.checkout.back')}
            </button>
            <h1 className="text-3xl font-bold text-espresso">
              {t('payment.checkout.title')}
            </h1>
            <p className="text-espresso/70 mt-1">{t('payment.checkout.subtitle')}</p>
          </motion.div>

          <Stepper currentStep={step} t={t} />

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {step === 'review' && (
                  <ReviewStep
                    key="review"
                    session={session}
                    formattedTotal={formattedTotal}
                    onContinue={() => goToStep('method')}
                    t={t}
                    language={language}
                  />
                )}
                {step === 'method' && (
                  <MethodStep
                    key="method"
                    method={paymentMethod}
                    onSelect={setPaymentMethod}
                    onBack={() => goToStep('review')}
                    onConfirm={submitPayment}
                    formattedTotal={formattedTotal}
                    error={error}
                    grants={eligibleGrants}
                    onUseGrant={submitGrantPayment}
                    language={language}
                    t={t}
                  />
                )}
                {step === 'processing' && (
                  <ProcessingStep
                    key="processing"
                    stage={processingStage}
                    t={t}
                  />
                )}
                {step === 'success' && (
                  <SuccessStep
                    key="success"
                    payment={completedPayment}
                    method={paymentMethod}
                    formattedTotal={formattedTotal}
                    onJoin={() =>
                      router.push(`/students/meeting-room/${sessionId}`)
                    }
                    onBackToSessions={() =>
                      router.push('/students/live-sessions')
                    }
                    t={t}
                    language={language}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-1">
              <OrderSummary
                session={session}
                formattedTotal={formattedTotal}
                language={language}
                t={t}
              />
            </div>
          </div>
          </div>
        </main>
      </div>
    </div>
  );
};


const Stepper = ({
  currentStep,
  t,
}: {
  currentStep: CheckoutStep;
  t: (key: string, fallback?: string) => string;
}) => {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  return (
    <ol className="flex items-center justify-between max-w-2xl">
      {STEP_ORDER.map((s, idx) => {
        const isDone = idx < currentIndex;
        const isActive = idx === currentIndex;
        return (
          <li key={s} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center w-9 h-9 rounded-full border-2 text-sm font-semibold flex-shrink-0 transition-colors ${
                isDone
                  ? 'bg-forest border-green-600 text-white'
                  : isActive
                    ? 'bg-terracotta border-blue-600 text-white'
                    : 'bg-cream-50 border-espresso/20 text-espresso/45'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isDone ? <Check className="w-4 h-4" /> : idx + 1}
            </div>
            <span
              className={`ml-2 text-sm font-medium ${
                isActive
                  ? 'text-espresso'
                  : isDone
                    ? 'text-espresso'
                    : 'text-espresso/45'
              }`}
            >
              {t(STEP_LABELS[s])}
            </span>
            {idx < STEP_ORDER.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-3 ${
                  idx < currentIndex ? 'bg-forest-300' : 'bg-cream-300'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};


const ReviewStep = ({
  session,
  formattedTotal,
  onContinue,
  t,
  language,
}: {
  session: SessionDetails | null;
  formattedTotal: string;
  onContinue: () => void;
  t: (key: string, fallback?: string) => string;
  language: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="bg-cream-50 rounded-2xl shadow-sm border border-espresso/10 p-6"
  >
    <h2 className="text-xl font-semibold text-espresso mb-4">
      {t('payment.review.heading')}
    </h2>

    {session && (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-espresso">{session.title}</h3>
          {session.description && (
            <p className="text-sm text-espresso/70 mt-1">{session.description}</p>
          )}
        </div>

        <div className="rounded-xl bg-forest/10 border border-forest/30 p-4">
          <p className="text-sm font-medium text-forest-500 mb-2">
            {t('payment.review.included')}
          </p>
          <ul className="space-y-1.5 text-sm text-forest-500">
            <Bullet text={t('payment.review.included.access')} />
            <Bullet text={t('payment.review.included.interaction')} />
            {session.recording_enabled && (
              <Bullet text={t('payment.review.included.recording')} />
            )}
            <Bullet text={t('payment.review.included.materials')} />
          </ul>
        </div>

        <div className="rounded-xl bg-cream-100 border border-espresso/15 p-4 flex items-center justify-between">
          <span className="text-sm text-espresso/70">{t('payment.total')}</span>
          <span className="text-xl font-bold text-espresso">{formattedTotal}</span>
        </div>
      </div>
    )}

    <div className="mt-6 flex justify-end">
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-terracotta-500 transition-colors focus:outline-none focus:ring-4 focus:ring-blue-200"
      >
        {t('payment.review.continue')}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  </motion.div>
);

const Bullet = ({ text }: { text: string }) => (
  <li className="flex items-start gap-2">
    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-forest" />
    <span>{text}</span>
  </li>
);


const MethodStep = ({
  method,
  onSelect,
  onBack,
  onConfirm,
  formattedTotal,
  error,
  grants,
  onUseGrant,
  language,
  t,
}: {
  method: PaymentMethod;
  onSelect: (m: PaymentMethod) => void;
  onBack: () => void;
  onConfirm: () => void;
  formattedTotal: string;
  error: string | null;
  grants: any[];
  onUseGrant: (grantId: string) => void;
  language: string;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="bg-cream-50 rounded-2xl shadow-sm border border-espresso/10 p-6"
  >
    <h2 className="text-xl font-semibold text-espresso mb-1">
      {t('payment.method.heading')}
    </h2>
    <p className="text-sm text-espresso/55 mb-5">
      {t('payment.checkout.secureNote')}
    </p>

    {grants.length > 0 && (
      <div className="mb-5 rounded-2xl border-2 border-forest-300 bg-forest/5 p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-xl bg-forest-300 text-white">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-espresso">
              Use a scholarship grant
            </p>
            <p className="text-xs text-espresso/70 mt-0.5">
              Pay this session in full with credit a sponsor already issued you. No card needed.
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          {grants.map((g) => {
            const amount = Number(g?.amount_lkr ?? 0);
            const expiresAt = g?.expires_at ? new Date(g.expires_at) : null;
            return (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream-50 border border-espresso/10 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-espresso">
                    {formatCurrency(amount, { locale: language })}
                  </p>
                  {expiresAt && (
                    <p className="text-xs text-espresso/55">
                      Expires {expiresAt.toLocaleDateString(language)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onUseGrant(g.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-forest-600"
                >
                  <Check className="w-4 h-4" />
                  Use this grant
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MethodTile
        active={method === 'payhere'}
        onClick={() => onSelect('payhere')}
        icon={<Landmark className="w-6 h-6" />}
        label={t('payment.method.payhere.label')}
        tag={t('payment.method.payhere.tag')}
        desc={t('payment.method.payhere.desc')}
      />
      <MethodTile
        active={method === 'card'}
        onClick={() => onSelect('card')}
        icon={<CreditCard className="w-6 h-6" />}
        label={t('payment.method.card.label')}
        tag={t('payment.method.card.tag')}
        desc={t('payment.method.card.desc')}
      />
    </div>

    {error && (
      <div
        role="alert"
        className="mt-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
      >
        <strong className="font-semibold">{t('payment.error.title')}:</strong>{' '}
        {error}
      </div>
    )}

    <div className="mt-6 flex items-start gap-3 rounded-xl bg-terracotta/10 border border-blue-100 px-4 py-3 text-sm text-terracotta-500">
      <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-terracotta" />
      <span>{t('payment.checkout.secureNote')}</span>
    </div>

    <div className="mt-6 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-xl border border-espresso/20 bg-cream-50 px-4 py-2.5 text-sm font-medium text-espresso hover:bg-cream-100 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('payment.method.back')}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-terracotta-500 transition-colors focus:outline-none focus:ring-4 focus:ring-blue-200"
      >
        <Lock className="w-4 h-4" />
        {t('payment.method.confirm', { amount: formattedTotal })}
      </button>
    </div>
  </motion.div>
);

const MethodTile = ({
  active,
  onClick,
  icon,
  label,
  tag,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tag: string;
  desc: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`text-left rounded-2xl border-2 px-5 py-4 transition-all focus:outline-none focus:ring-4 focus:ring-blue-100 ${
      active
        ? 'border-blue-600 bg-terracotta/10/40 shadow-md'
        : 'border-espresso/15 bg-cream-50 hover:border-espresso/20'
    }`}
  >
    <div className="flex items-start justify-between gap-4">
      <div
        className={`p-2.5 rounded-xl ${
          active ? 'bg-terracotta text-white' : 'bg-cream-100 text-espresso/70'
        }`}
      >
        {icon}
      </div>
      {active && <Check className="w-5 h-5 text-terracotta" />}
    </div>
    <div className="mt-3">
      <p className="text-base font-semibold text-espresso">{label}</p>
      <p className="text-xs text-espresso/55 mt-0.5">{tag}</p>
      <p className="text-sm text-espresso/70 mt-2 leading-relaxed">{desc}</p>
    </div>
  </button>
);


const ProcessingStep = ({
  stage,
  t,
}: {
  stage: 1 | 2;
  t: (key: string, fallback?: string) => string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="bg-cream-50 rounded-2xl shadow-sm border border-espresso/10 p-10 text-center"
  >
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-terracotta/15 mb-5">
      <Loader2 className="w-8 h-8 text-terracotta animate-spin" />
    </div>
    <h2 className="text-xl font-semibold text-espresso">
      {t('payment.processing.heading')}
    </h2>
    <p className="text-sm text-espresso/55 mt-1">
      {t('payment.processing.subtitle')}
    </p>

    <div className="mt-6 space-y-3 max-w-sm mx-auto">
      <ProcessingLine
        active={stage === 1}
        done={stage > 1}
        label={t('payment.processing.stage1')}
      />
      <ProcessingLine
        active={stage === 2}
        done={false}
        label={t('payment.processing.stage2')}
      />
    </div>
  </motion.div>
);

const ProcessingLine = ({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) => (
  <div
    className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
      done
        ? 'border-forest/30 bg-forest/10 text-forest-500'
        : active
          ? 'border-terracotta/30 bg-terracotta/10 text-terracotta-500'
          : 'border-espresso/15 bg-cream-50 text-espresso/55'
    }`}
  >
    {done ? (
      <CheckCircle2 className="w-5 h-5 text-forest" />
    ) : active ? (
      <Loader2 className="w-5 h-5 text-terracotta animate-spin" />
    ) : (
      <div className="w-5 h-5 rounded-full border-2 border-espresso/20" />
    )}
    <span className="text-sm font-medium">{label}</span>
  </div>
);


const SuccessStep = ({
  payment,
  method,
  formattedTotal,
  onJoin,
  onBackToSessions,
  t,
  language,
}: {
  payment: DemoPayment | null;
  method: PaymentMethod;
  formattedTotal: string;
  onJoin: () => void;
  onBackToSessions: () => void;
  t: (key: string, fallback?: string) => string;
  language: string;
}) => {
  const txnId =
    payment?.transaction_id ||
    `DEMO-${(payment?.id || 'XXXXXXXX').toString().slice(0, 8).toUpperCase()}`;
  const paidAt = payment?.paid_at
    ? new Date(payment.paid_at).toLocaleString(language)
    : new Date().toLocaleString(language);

  const methodLabel =
    method === 'payhere'
      ? t('payment.method.payhere.label')
      : t('payment.method.card.label');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-cream-50 rounded-2xl shadow-sm border border-espresso/10 p-8 text-center"
    >
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-forest/15 mb-4">
        <CheckCircle2 className="w-9 h-9 text-forest" />
      </div>
      <h2 className="text-2xl font-bold text-espresso">
        {t('payment.success.heading')}
      </h2>
      <p className="text-sm text-espresso/70 mt-1">
        {t('payment.success.subtitle')}
      </p>

      <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-md mx-auto">
        <ReceiptRow
          label={t('payment.success.transactionId')}
          value={txnId}
        />
        <ReceiptRow label={t('payment.success.method')} value={methodLabel} />
        <ReceiptRow label={t('payment.success.amount')} value={formattedTotal} />
        <ReceiptRow label={t('payment.success.paidAt')} value={paidAt} />
      </dl>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-mustard/15 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-800">
        <Info className="w-3.5 h-3.5" />
        {t('payment.demo.pill')}
      </div>

      <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
        <button
          type="button"
          onClick={onJoin}
          className="rounded-xl bg-terracotta px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-terracotta-500 transition-colors focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          {t('payment.success.joinSession')}
        </button>
        <button
          type="button"
          onClick={onBackToSessions}
          className="rounded-xl border border-espresso/20 bg-cream-50 px-5 py-3 text-sm font-medium text-espresso hover:bg-cream-100 transition-colors"
        >
          {t('payment.success.viewSessions')}
        </button>
      </div>
    </motion.div>
  );
};

const ReceiptRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-espresso/15 px-4 py-3 bg-cream-100/40">
    <dt className="text-xs uppercase tracking-wide text-espresso/55">{label}</dt>
    <dd className="mt-1 text-sm font-semibold text-espresso break-all">
      {value}
    </dd>
  </div>
);


const OrderSummary = ({
  session,
  formattedTotal,
  language,
  t,
}: {
  session: SessionDetails | null;
  formattedTotal: string;
  language: string;
  t: (key: string, fallback?: string) => string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.1 }}
    className="bg-cream-50 rounded-2xl shadow-sm border border-espresso/10 p-6 sticky top-24"
  >
    <h3 className="text-lg font-semibold text-espresso mb-3">
      {t('payment.review.heading')}
    </h3>

    {session && (
      <>
        <div className="mb-4">
          <p className="font-medium text-espresso">{session.title}</p>
          {session.description && (
            <p className="text-sm text-espresso/70 line-clamp-2 mt-1">
              {session.description}
            </p>
          )}
        </div>

        <div className="border-t border-espresso/10 pt-3 space-y-1.5 text-sm">
          <SummaryLine
            label={t('payment.subtotal')}
            value={formattedTotal}
          />
          <SummaryLine
            label={t('payment.fees')}
            value={formatCurrency(0, { locale: language })}
          />
        </div>

        <div className="border-t border-espresso/15 mt-3 pt-3 flex justify-between items-baseline">
          <span className="text-sm font-semibold text-espresso">
            {t('payment.total')}
          </span>
          <span className="text-lg font-bold text-terracotta">
            {formattedTotal}
          </span>
        </div>
      </>
    )}
  </motion.div>
);

const SummaryLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-espresso/70">
    <span>{label}</span>
    <span className="font-medium text-espresso">{value}</span>
  </div>
);

export default SessionPaymentPage;

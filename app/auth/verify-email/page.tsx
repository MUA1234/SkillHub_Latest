'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, Mail, MailCheck } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { DoodleStar, DoodleSparkle } from '@/components/ui/doodle';
import { Logo } from '@/components/ui/logo';

type Status = 'verifying' | 'success' | 'already' | 'error' | 'missing';

function VerifyEmailInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await apiClient.verifyEmail(token);
        if (cancelled) return;
        setStatus(result.already_verified ? 'already' : 'success');
      } catch (err: any) {
        if (cancelled) return;
        setErrorMsg(err?.message || t('auth.verify.error', 'This verification link is invalid or has expired. Request a new one below.'));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token, t]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    try {
      await apiClient.resendVerification(resendEmail);
      setResendSent(true);
    } catch {
      setResendSent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 w-full max-w-md bg-cream-50 rounded-3xl shadow-kid-lg p-6 sm:p-10 border-2 border-espresso"
    >
      {status === 'verifying' && (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-mustard mb-4 border-2 border-espresso shadow-sticker-sm">
            <Loader2 className="w-7 h-7 text-espresso animate-spin" />
          </div>
          <h1 className="font-display text-2xl font-bold text-espresso mb-2">
            {t('auth.verify.verifying', 'Verifying your email…')}
          </h1>
          <p className="text-espresso/65 text-sm">
            {t('auth.verify.holdOn', 'Hold on while we confirm your account.')}
          </p>
        </div>
      )}

      {(status === 'success' || status === 'already') && (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forest text-cream mb-4 border-2 border-espresso shadow-sticker-sm">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="font-display text-2xl font-bold text-espresso mb-2">
            {status === 'already'
              ? t('auth.verify.alreadyTitle', 'Already verified')
              : t('auth.verify.successTitle', 'Email verified!')}
          </h1>
          <p className="text-espresso/65 text-sm mb-6">
            {status === 'already'
              ? t('auth.verify.alreadyBody', 'Your email is already confirmed — you can sign in any time.')
              : t('auth.verify.successBody', 'Thanks! Your account is ready. Sign in to start.')}
          </p>
          <Link href="/auth" className="btn-kid-primary inline-flex">
            {t('common.signIn', 'Sign In')}
          </Link>
        </div>
      )}

      {(status === 'error' || status === 'missing') && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-coral text-cream mb-4 border-2 border-espresso shadow-sticker-sm">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-espresso mb-2">
              {t('auth.verify.errorTitle', 'Verification problem')}
            </h1>
            <p className="text-espresso/65 text-sm">
              {status === 'missing'
                ? t('auth.verify.missingToken', 'This page needs a token from your verification email.')
                : errorMsg}
            </p>
          </div>

          {!resendSent ? (
            <form onSubmit={handleResend} className="space-y-3">
              <label className="block text-sm font-semibold text-espresso">
                {t('auth.verify.resendLabel', 'Resend the verification email')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-espresso/45">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  required
                  placeholder="your.email@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                />
              </div>
              <button
                type="submit"
                disabled={resending || !resendEmail}
                className="btn-kid-primary w-full !rounded-2xl !py-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {resending && <Loader2 className="animate-spin mr-2" size={18} />}
                {t('auth.verify.resendCta', 'Send new verification link')}
              </button>
            </form>
          ) : (
            <div className="rounded-2xl bg-forest/10 border-2 border-forest/30 p-4 text-sm text-forest-500 font-semibold flex gap-2">
              <MailCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>{t('auth.verify.resendSent', 'If your account exists, a new verification email is on its way.')}</span>
            </div>
          )}

          <div className="text-center">
            <Link href="/auth" className="text-sm text-terracotta hover:text-terracotta-500 font-bold">
              {t('auth.forgot.backToLogin', 'Back to sign in')}
            </Link>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-cream-100/90 backdrop-blur-md border-b border-espresso/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="SkillHub home">
            <Logo size="md" priority />
          </Link>
          <Link href="/auth" className="text-sm font-semibold text-espresso/75 hover:text-terracotta">← Back to sign in</Link>
        </div>
      </header>

      <div className="flex items-center justify-center px-4 py-12 relative min-h-[calc(100vh-4rem)]">
        <DoodleStar    className="absolute top-12 left-12 w-8 text-mustard animate-wiggle pointer-events-none" />
        <DoodleSparkle className="absolute bottom-12 right-12 w-10 text-terracotta animate-float pointer-events-none" />
        <Suspense fallback={null}>
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  );
}

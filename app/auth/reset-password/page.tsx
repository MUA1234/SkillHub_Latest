'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { DoodleStar, DoodleSparkle } from '@/components/ui/doodle';
import { Logo } from '@/components/ui/logo';

function ResetPasswordInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('auth.reset.missingToken', 'This reset link is missing its token. Please request a new password reset.'));
    }
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError(t('auth.reset.tooShort', 'Password must be at least 6 characters.')); return; }
    if (password !== confirm) { setError(t('auth.reset.mismatch', 'Passwords do not match.')); return; }
    if (!token) return;
    setIsLoading(true);
    try {
      await apiClient.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push('/auth'), 1800);
    } catch (err: any) {
      setError(err?.message || t('auth.reset.failed', 'This reset link is invalid or has expired. Please request a new one.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 w-full max-w-md bg-cream-50 rounded-3xl shadow-kid-lg p-6 sm:p-10 border-2 border-espresso"
    >
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forest text-cream mb-4 border-2 border-espresso shadow-sticker-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="font-display text-3xl font-bold text-espresso mb-2">
          {success ? t('auth.reset.successTitle', 'Password updated') : t('auth.reset.title', 'Set a new password')}
        </h1>
        <p className="text-espresso/65 text-sm">
          {success
            ? t('auth.reset.successHint', 'Redirecting you to sign in…')
            : t('auth.reset.subtitle', 'Choose a strong password you can remember.')}
        </p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6 p-4 rounded-2xl bg-coral/10 border-2 border-coral text-coral text-sm font-semibold"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {!success && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-espresso mb-2">
              {t('auth.reset.newPassword', 'New password')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-espresso/45">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                autoFocus
                placeholder="••••••••"
                className="w-full pl-10 pr-12 py-2.5 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-espresso/45 hover:text-espresso"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-espresso mb-2">
              {t('auth.reset.confirmPassword', 'Confirm new password')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-espresso/45">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                required
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading || !token}
            className="btn-kid-primary w-full !rounded-2xl !py-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isLoading && <Loader2 className="animate-spin mr-2" size={20} />}
            {isLoading ? t('common.loading', 'Loading...') : t('auth.reset.submit', 'Update password')}
          </motion.button>
        </form>
      )}

      {success && (
        <div className="rounded-2xl bg-forest/10 border-2 border-forest/30 p-4 text-sm text-forest-500 font-semibold text-center">
          {t('auth.reset.successBody', 'Your password has been updated. You can now sign in.')}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/auth" className="text-sm text-terracotta hover:text-terracotta-500 font-bold">
          {t('auth.forgot.backToLogin', 'Back to sign in')}
        </Link>
      </div>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
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
          <ResetPasswordInner />
        </Suspense>
      </div>
    </div>
  );
}

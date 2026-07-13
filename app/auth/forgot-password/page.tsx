'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { Illustration } from '@/components/ui/illustration';
import { Logo } from '@/components/ui/logo';
import { DoodleStar, DoodleSparkle } from '@/components/ui/doodle';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await apiClient.forgotPassword(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || t('auth.forgot.error', 'Could not send reset email. Try again later.'));
    } finally {
      setIsLoading(false);
    }
  };

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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-md bg-cream-50 rounded-3xl shadow-kid-lg p-6 sm:p-10 border-2 border-espresso"
        >
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-mustard mb-4 border-2 border-espresso shadow-sticker-sm">
              <KeyRound className="w-7 h-7 text-espresso" />
            </div>
            <h1 className="font-display text-3xl font-bold text-espresso mb-2">
              {t('auth.forgot.title', 'Forgot password?')}
            </h1>
            <p className="text-espresso/65 text-sm max-w-xs mx-auto">
              {submitted
                ? t('auth.forgot.successHint', 'If that email is registered, a reset link is on its way. Check your inbox (and spam).')
                : t('auth.forgot.subtitle', 'Enter your email and we\'ll send you a reset link.')}
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

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-espresso mb-2">
                  {t('auth.email', 'Email Address')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-espresso/45">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="your.email@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/40 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition duration-200"
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading || !email}
                className="btn-kid-primary w-full !rounded-2xl !py-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {isLoading && <Loader2 className="animate-spin mr-2" size={20} />}
                {isLoading ? t('common.loading', 'Loading...') : t('auth.forgot.send', 'Send reset link')}
              </motion.button>
            </form>
          ) : (
            <div className="rounded-2xl bg-forest/10 border-2 border-forest/30 p-4 text-sm text-forest-500 font-semibold">
              {t('auth.forgot.checkInbox', 'We sent a reset link if an account exists for this email. The link expires in 1 hour.')}
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              href="/auth"
              className="inline-flex items-center gap-1 text-sm text-terracotta hover:text-terracotta-500 font-bold"
            >
              <ArrowLeft size={14} />
              {t('auth.forgot.backToLogin', 'Back to sign in')}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

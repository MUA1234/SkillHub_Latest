'use client';

/**
 * Guardian invite landing page — Phase H2.
 *
 * Hit when a guardian clicks the link in their invite email
 * (`/auth/guardian-verify?code=…`). The page:
 *
 *   1. Loads the invite via `GET /guardians/invite/:code` to render
 *      "{student} invited you" + the relationship + the requested
 *      permissions. The code itself is the bearer secret on this read so
 *      no auth is required.
 *
 *   2. If a SkillHub account already exists for the guardian's email, we
 *      surface a "Continue" button — accepting only links the existing
 *      account; no password is collected.
 *
 *   3. If not, we render the new-guardian signup form (password + name).
 *      The auth pipeline issues a JWT in the response, which the api
 *      client tucks into localStorage so the redirect lands the guardian
 *      straight on /guardian/dashboard.
 *
 * Errors come in three flavors and the UI distinguishes them:
 *   - 404: code not found / link revoked.
 *   - 410: code already used or expired (different copy from "missing").
 *   - other: surfaced verbatim under the form.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface InviteData {
  guardian_email: string;
  guardian_name?: string | null;
  relationship?: string | null;
  student: { id: string; name: string; email?: string; avatar_url?: string };
  expires_at?: string | null;
  permissions: Record<string, boolean>;
}

type Status = 'loading' | 'ready' | 'missing' | 'used' | 'expired' | 'error';

function GuardianVerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';

  const [status, setStatus] = useState<Status>(code ? 'loading' : 'missing');
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await apiClient.getGuardianInvite(code);
        if (cancelled) return;
        setInvite(result);
        if (result.guardian_name && !firstName) {
          const parts = result.guardian_name.split(' ');
          setFirstName(parts[0] || '');
          setLastName(parts.slice(1).join(' ') || '');
        }
        setStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        const msg: string = err?.message || '';
        if (msg.includes('410') || msg.toLowerCase().includes('already been used')) {
          setStatus('used');
        } else if (msg.toLowerCase().includes('expired')) {
          setStatus('expired');
        } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          setStatus('missing');
        } else {
          setErrorMsg(msg || 'Could not load this invite. Please try again.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const permissionsList = useMemo(() => {
    if (!invite?.permissions) return [];
    const labels: Record<string, string> = {
      can_view_progress: 'See course progress',
      can_view_grades: 'See grades and exam results',
      can_view_accessibility: 'See accessibility settings',
      can_communicate_teachers: 'Message teachers',
      can_modify_accessibility: 'Adjust accessibility settings',
    };
    return Object.entries(invite.permissions)
      .filter(([, v]) => v)
      .map(([k]) => labels[k] || k);
  }, [invite]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (password && password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiClient.acceptGuardianInvite({
        code,
        password: password || undefined,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });
      if (result?.success) {
        router.push('/guardian/dashboard');
        return;
      }
      setSubmitError('Could not accept invite. Please try again.');
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not accept invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };


  if (status === 'missing' || !code) {
    return (
      <Wrapper>
        <Card icon={<AlertCircle className="w-12 h-12 text-mustard" />} title="Invite not found">
          <p className="text-sm text-espresso/70">
            We could not find this guardian invite. Please ask the student to send a new
            one from their accessibility settings.
          </p>
          <Link
            href="/auth"
            className="btn-kid-primary mt-6 !py-2 !px-4 text-sm"
          >
            Go to sign in
          </Link>
        </Card>
      </Wrapper>
    );
  }

  if (status === 'loading') {
    return (
      <Wrapper>
        <Card icon={<Loader2 className="w-10 h-10 animate-spin text-terracotta" />} title="Loading invite…">
          <p className="text-sm text-espresso/55">Just a moment.</p>
        </Card>
      </Wrapper>
    );
  }

  if (status === 'used') {
    return (
      <Wrapper>
        <Card icon={<CheckCircle2 className="w-12 h-12 text-forest" />} title="Invite already used">
          <p className="text-sm text-espresso/70">
            This invite link has already been redeemed. If you're the guardian on the
            invite, sign in to your existing account.
          </p>
          <Link
            href="/auth"
            className="btn-kid-primary mt-6 !py-2 !px-4 text-sm"
          >
            Sign in
          </Link>
        </Card>
      </Wrapper>
    );
  }

  if (status === 'expired') {
    return (
      <Wrapper>
        <Card icon={<AlertCircle className="w-12 h-12 text-mustard" />} title="Invite expired">
          <p className="text-sm text-espresso/70">
            This invite has expired. Please ask the student to send a fresh one — invites
            are valid for 14 days.
          </p>
        </Card>
      </Wrapper>
    );
  }

  if (status === 'error') {
    return (
      <Wrapper>
        <Card icon={<AlertCircle className="w-12 h-12 text-coral" />} title="Couldn't load invite">
          <p className="text-sm text-coral font-semibold">{errorMsg}</p>
        </Card>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-cream-50 rounded-3xl shadow-kid-lg border-2 border-espresso max-w-md w-full p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-forest text-cream flex items-center justify-center border-2 border-espresso shadow-sticker-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-espresso">Guardian invite</h1>
            <p className="text-xs text-espresso/55">SkillHub — Inclusive Education</p>
          </div>
        </div>

        <div className="rounded-2xl bg-mustard/15 border-2 border-mustard/40 p-4 mb-6">
          <p className="text-sm text-espresso">
            <strong className="text-terracotta font-bold">{invite!.student.name}</strong> has invited
            you to be their guardian
            {invite!.relationship ? (
              <> as their <strong>{invite!.relationship}</strong></>
            ) : null}
            .
          </p>
          {permissionsList.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-espresso/70">
              {permissionsList.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest mt-0.5 flex-shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          <div className="rounded-xl border-2 border-espresso/15 bg-cream-100 px-3 py-2.5 text-sm text-espresso flex items-center gap-2">
            <Mail className="w-4 h-4 text-espresso/45" />
            <span className="truncate">{invite!.guardian_email}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-espresso mb-1">First name</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-cream-50 rounded-xl border-2 border-espresso/15 px-3 py-2.5 text-espresso placeholder:text-espresso/40 focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 outline-none transition"
                autoComplete="given-name"
              />
            </label>
            <label className="text-sm">
              <span className="block text-espresso mb-1">Last name</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-cream-50 rounded-xl border-2 border-espresso/15 px-3 py-2.5 text-espresso placeholder:text-espresso/40 focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 outline-none transition"
                autoComplete="family-name"
              />
            </label>
          </div>

          <label className="text-sm block">
            <span className="block text-espresso mb-1">Create a password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-cream-50 rounded-xl border-2 border-espresso/15 px-3 py-2.5 text-espresso placeholder:text-espresso/40 focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 outline-none transition"
              minLength={6}
              autoComplete="new-password"
            />
            <span className="block text-xs text-espresso/55 mt-1">
              At least 6 characters. If you already have a SkillHub account with this
              email, leave this blank — we'll just link your existing account.
            </span>
          </label>

          {password && (
            <label className="text-sm block">
              <span className="block text-espresso mb-1">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-cream-50 rounded-xl border-2 border-espresso/15 px-3 py-2.5 text-espresso placeholder:text-espresso/40 focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 outline-none transition"
                minLength={6}
                autoComplete="new-password"
              />
            </label>
          )}

          {submitError && (
            <div className="rounded-2xl border-2 border-coral bg-coral/10 p-3 text-sm text-coral font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-kid-primary w-full !rounded-2xl !py-3 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserIcon className="w-4 h-4" />}
            Accept invite
          </button>

          <p className="text-xs text-espresso/55 text-center">
            By accepting, you agree to view {invite!.student.name}'s information within the
            limits set by their student account.
          </p>
        </form>
      </motion.div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-6">
      {children}
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-cream-50 rounded-3xl shadow-kid-lg border-2 border-espresso max-w-md w-full p-8 text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <h1 className="text-xl font-bold text-espresso mb-3">{title}</h1>
      {children}
    </div>
  );
}

export default function GuardianVerifyPage() {
  return (
    <Suspense
      fallback={
        <Wrapper>
          <Card icon={<Loader2 className="w-10 h-10 animate-spin text-green-600" />} title="Loading…">
            <p className="text-sm text-espresso/55">Please wait.</p>
          </Card>
        </Wrapper>
      }
    >
      <GuardianVerifyInner />
    </Suspense>
  );
}

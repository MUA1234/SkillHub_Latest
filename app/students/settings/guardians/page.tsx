'use client';

/**
 * Student-side guardian management.
 *
 * Closes the guardian invite loop. Previously the backend POST
 * /api/v1/accessibility/guardian-links existed but had no caller — students
 * couldn't actually generate an invite link or email. The accessibility
 * onboarding form collected a `guardian_email` field, but that string only
 * landed on the disability profile and never triggered an invite send.
 *
 * Flow:
 *   1. Student fills in guardian email + relationship + permission flags.
 *   2. POST /accessibility/guardian-links — server inserts the row,
 *      generates a verification_code, and emails the guardian an invite link.
 *   3. Guardian clicks /auth/guardian-verify?code=… → accepts → portal opens.
 *
 * Once linked, the row appears in the list below with a revoke button.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Heart, Loader2, AlertCircle, Plus, X, ShieldCheck,
  Trash2, Clock, CheckCircle2, Mail,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { getCurrentUser, isAuthenticated } from '@/lib/api';

interface GuardianLink {
  id: string;
  guardian_email: string;
  guardian_name?: string | null;
  relationship?: string | null;
  is_verified: boolean;
  is_active: boolean;
  expires_at?: string | null;
  invited_at?: string | null;
  can_view_progress: boolean;
  can_view_grades: boolean;
  can_view_accessibility: boolean;
  can_communicate_teachers: boolean;
  can_modify_accessibility: boolean;
}

const PERMISSION_LABELS: Array<{ key: keyof Pick<GuardianLink, 'can_view_progress' | 'can_view_grades' | 'can_view_accessibility' | 'can_communicate_teachers' | 'can_modify_accessibility'>; label: string; help: string; default: boolean }> = [
  { key: 'can_view_progress', label: 'See my progress', help: 'Enrolled courses, lesson completion, hours studied.', default: true },
  { key: 'can_view_grades', label: 'See my grades', help: 'Exam scores and certificates.', default: true },
  { key: 'can_view_accessibility', label: 'See my accessibility settings', help: 'Read-only view of captions, fonts, etc.', default: true },
  { key: 'can_communicate_teachers', label: 'Message my teachers', help: 'Send chat messages on my behalf.', default: true },
  { key: 'can_modify_accessibility', label: 'Edit my accessibility settings', help: 'Trusted guardians only — they can change captions / font size.', default: false },
];

export default function StudentGuardiansPage() {
  const router = useRouter();
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({
    guardian_email: '',
    guardian_name: '',
    relationship: 'parent',
    permissions: PERMISSION_LABELS.reduce(
      (acc, p) => ({ ...acc, [p.key]: p.default }),
      {} as Record<string, boolean>,
    ),
  });

  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName = `${currentUser?.profile?.first_name || 'Student'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  useEffect(() => {
    if (!isAuthenticated() || currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/guardian-links`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setLinks(data?.guardian_links || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load guardians.');
      setLinks([]);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.guardian_email.trim())) {
      alert('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/guardian-links`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardian_email: draft.guardian_email.trim().toLowerCase(),
          guardian_name: draft.guardian_name.trim() || null,
          relationship: draft.relationship || null,
          ...draft.permissions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to send invite.');
      }
      setInviteOpen(false);
      setDraft({
        guardian_email: '',
        guardian_name: '',
        relationship: 'parent',
        permissions: PERMISSION_LABELS.reduce(
          (acc, p) => ({ ...acc, [p.key]: p.default }),
          {} as Record<string, boolean>,
        ),
      });
      load();
    } catch (err: any) {
      alert(err?.message || 'Could not send invite.');
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (link: GuardianLink) => {
    if (!confirm(`Revoke ${link.guardian_email}'s access?`)) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/guardian-links/${link.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      }).catch(() => {});
      load();
    } catch {
      alert('Could not revoke. Try again.');
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole={userRole as 'student' | 'teacher' | 'sponsor'} />
      <main className="pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0 max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <PageHeader title="Your" accent="guardians" />
                <p className="text-espresso/70 mt-2 max-w-xl">
                  Invite a parent, sibling, or counsellor to follow your learning. You
                  decide what they can see and whether they can adjust settings for you.
                </p>
              </div>
              <button onClick={() => setInviteOpen(true)} className="btn-kid-primary">
                <Plus className="w-4 h-4" />
                Invite guardian
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3 text-terracotta" />
                <p className="text-sm text-espresso/70">Loading…</p>
              </div>
            ) : error ? (
              <div className="bg-coral-50 border-2 border-coral-200 rounded-2xl p-5 text-center">
                <AlertCircle className="w-8 h-8 text-coral-400 mx-auto mb-2" />
                <p className="text-coral-400 font-semibold mb-2">{error}</p>
                <button onClick={load} className="btn-kid-primary text-sm">Retry</button>
              </div>
            ) : links.length === 0 ? (
              <EmptyState
                illustration="welcome-guardian"
                title="No guardians linked yet"
                body="Invite someone you trust to see your progress. They'll get an email with a one-click link to join."
                actions={
                  <button onClick={() => setInviteOpen(true)} className="btn-kid-primary">
                    <Plus className="w-4 h-4" />
                    Send your first invite
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {links.map((link) => (
                  <KidCard key={link.id} tone="cream" className="!p-5">
                    <div className="flex items-start gap-4">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-terracotta text-cream border-2 border-espresso shadow-sticker-sm shrink-0">
                        <Heart className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-espresso truncate">
                            {link.guardian_name || link.guardian_email}
                          </p>
                          {link.is_verified ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-forest-50 text-forest-500 border border-forest-200">
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-mustard-50 text-espresso border border-mustard-200">
                              <Clock className="w-3 h-3" /> Pending invite
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-espresso/65 mt-0.5">
                          {link.guardian_email}
                          {link.relationship ? ` · ${link.relationship}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {PERMISSION_LABELS.filter((p) => link[p.key]).map((p) => (
                            <span
                              key={p.key}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cream-100 text-espresso/75 border border-espresso/10"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {p.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => revoke(link)}
                        className="text-coral-400 hover:text-coral-300 p-2 rounded-full hover:bg-coral-50"
                        aria-label="Revoke access"
                        title="Revoke access"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </KidCard>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {}
      {inviteOpen && (
        <div className="fixed inset-0 bg-espresso/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50 rounded-3xl border-2 border-espresso shadow-kid-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-espresso text-cream px-5 py-4 rounded-t-3xl flex items-center justify-between">
              <h2 className="text-base font-bold">Invite a guardian</h2>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="text-cream/65 hover:text-cream rounded-full p-1 hover:bg-cream/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submit} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-espresso/65 mb-1">
                  Guardian email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-espresso/45" />
                  <input
                    type="email"
                    value={draft.guardian_email}
                    onChange={(e) => setDraft({ ...draft, guardian_email: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                    placeholder="parent@email.com"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-espresso/65 mb-1">
                    Name (optional)
                  </label>
                  <input
                    type="text"
                    value={draft.guardian_name}
                    onChange={(e) => setDraft({ ...draft, guardian_name: e.target.value })}
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                    placeholder="Anjali Perera"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-espresso/65 mb-1">
                    Relationship
                  </label>
                  <select
                    value={draft.relationship}
                    onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
                    className="w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none"
                  >
                    <option value="parent">Parent</option>
                    <option value="guardian">Guardian</option>
                    <option value="sibling">Sibling</option>
                    <option value="counsellor">Counsellor</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="block text-xs font-bold uppercase tracking-wide text-espresso/65 mb-2">
                  What they can do
                </p>
                <div className="space-y-2">
                  {PERMISSION_LABELS.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-start gap-3 px-3 py-2 rounded-xl border-2 border-espresso/10 hover:border-espresso/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={draft.permissions[p.key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            permissions: { ...draft.permissions, [p.key]: e.target.checked },
                          })
                        }
                        className="mt-1 accent-terracotta"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-espresso">{p.label}</p>
                        <p className="text-xs text-espresso/65">{p.help}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t-2 border-espresso/10">
                <button type="button" onClick={() => setInviteOpen(false)} className="btn-kid-ghost text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-kid-primary text-sm disabled:opacity-50">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send invite
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

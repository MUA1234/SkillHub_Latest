'use client';

/**
 * Shared profile view+edit surface used by the student / teacher / sponsor
 * profile pages. Owns the common `user_profiles` fields (name, phone,
 * location, bio, avatar) via getUserProfile()/updateUserProfile(), and lets
 * each role inject a role-specific section with its own state + save callback.
 */

import React, { ReactNode, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Camera, Save, CheckCircle2 } from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { KidCard } from '@/components/ui/kid-card';
import { apiClient, getCurrentUser, isAuthenticated, type UserProfile } from '@/lib/api';

export interface CommonProfileState {
  first_name: string;
  last_name: string;
  phone: string;
  location: string;
  bio: string;
  avatar_url: string;
  university: string;
  major: string;
  year: string;
}

const EMPTY: CommonProfileState = {
  first_name: '', last_name: '', phone: '', location: '', bio: '',
  avatar_url: '', university: '', major: '', year: '',
};

interface ProfileEditorProps {
  userRole: 'student' | 'teacher' | 'sponsor';
  /** Show academic fields (university / major / year) — students only. */
  showAcademic?: boolean;
  /** Role-specific section rendered below the common fields. */
  roleSection?: ReactNode;
  /** Called on save, after the common profile is persisted. Persist role
   *  data here and throw to surface an error. */
  onSaveExtra?: () => Promise<void>;
  /** Load role-specific data when the page mounts. */
  onLoadExtra?: () => Promise<void>;
}

const inputCls =
  'w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-espresso/70 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function TextField({
  label, value, onChange, placeholder, type = 'text',
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <Field label={label}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </Field>
  );
}

export default function ProfileEditor({
  userRole, showAcademic, roleSection, onSaveExtra, onLoadExtra,
}: ProfileEditorProps) {
  const router = useRouter();
  const [common, setCommon] = useState<CommonProfileState>(EMPTY);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const currentUser = getCurrentUser();
  const userName = `${common.first_name || currentUser?.profile?.first_name || ''} ${common.last_name || currentUser?.profile?.last_name || ''}`.trim() || 'My Profile';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [p] = await Promise.all([
        apiClient.getUserProfile() as Promise<UserProfile & { email?: string }>,
        onLoadExtra ? onLoadExtra() : Promise.resolve(),
      ]);
      setEmail(p.email || currentUser?.email || '');
      setCommon({
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        phone: p.phone || '',
        location: p.location || '',
        bio: p.bio || '',
        avatar_url: p.avatar_url || '',
        university: p.university || '',
        major: p.major || '',
        year: p.year || '',
      });
    } catch (err: any) {
      setError(err?.message || 'Could not load your profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const set = (k: keyof CommonProfileState) => (v: string) => setCommon((c) => ({ ...c, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload: Record<string, any> = {
        first_name: common.first_name,
        last_name: common.last_name,
        phone: common.phone,
        location: common.location,
        bio: common.bio,
        avatar_url: common.avatar_url,
      };
      if (showAcademic) {
        payload.university = common.university;
        payload.major = common.major;
        payload.year = common.year;
      }
      const updated = (await apiClient.updateUserProfile(payload)) as UserProfile;
      if (onSaveExtra) await onSaveExtra();

      // Keep the cached current_user in sync so the nav/header update too.
      try {
        const cu = getCurrentUser();
        if (cu) {
          const merged = { ...cu, profile: { ...(cu.profile || {}), first_name: updated.first_name, last_name: updated.last_name, avatar_url: updated.avatar_url } };
          localStorage.setItem('current_user', JSON.stringify(merged));
        }
      } catch {}

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const initial = (common.first_name || email || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole={userRole} userName={userName} userEmail={email} />
      <DashboardSidebar userRole={userRole} />
      <div className="pt-20 pb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <PageHeader
              eyebrow="Account"
              title="Your"
              accent="profile"
              body="Update your information so others see the right details."
            />
          </motion.div>

          {isLoading ? (
            <KidCard tone="cream" className="!p-10 text-center text-sm text-espresso/55">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-terracotta" />
              <p className="mt-4">Loading your profile…</p>
            </KidCard>
          ) : (
            <>
              {error && (
                <KidCard tone="cream" className="border-coral !p-4">
                  <p className="text-coral font-semibold">{error}</p>
                </KidCard>
              )}

              <KidCard tone="cream" className="!p-6">
                <div className="flex items-center gap-4 mb-6">
                  {common.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={common.avatar_url} alt={userName} className="w-20 h-20 rounded-full object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-forest text-cream flex items-center justify-center font-bold text-2xl">{initial}</div>
                  )}
                  <div>
                    <h2 className="font-display text-xl font-bold text-espresso">{userName}</h2>
                    <p className="text-sm text-espresso/60">{email}</p>
                    <p className="text-xs text-espresso/45 mt-0.5 capitalize">{userRole} account</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <TextField label="First name" value={common.first_name} onChange={set('first_name')} placeholder="Your first name" />
                  <TextField label="Last name" value={common.last_name} onChange={set('last_name')} placeholder="Your last name" />
                  <Field label="Email">
                    <input value={email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
                  </Field>
                  <TextField label="Phone" value={common.phone} onChange={set('phone')} placeholder="+94 7X XXX XXXX" />
                  <TextField label="Location" value={common.location} onChange={set('location')} placeholder="City, Country" />
                  <TextField label="Avatar image URL" value={common.avatar_url} onChange={set('avatar_url')} placeholder="https://…" />
                </div>

                {showAcademic && (
                  <div className="grid sm:grid-cols-3 gap-4 mt-4">
                    <TextField label="University / School" value={common.university} onChange={set('university')} placeholder="e.g. University of Colombo" />
                    <TextField label="Major / Field" value={common.major} onChange={set('major')} placeholder="e.g. Computer Science" />
                    <TextField label="Year" value={common.year} onChange={set('year')} placeholder="e.g. 2nd year" />
                  </div>
                )}

                <div className="mt-4">
                  <Field label="Bio">
                    <textarea value={common.bio} onChange={(e) => set('bio')(e.target.value)} rows={3} placeholder="Tell others a little about yourself…" className={inputCls} />
                  </Field>
                </div>
              </KidCard>

              {roleSection}

              <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={saving} className="btn-kid-primary !py-2.5 !px-6 text-sm disabled:opacity-50 inline-flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest">
                    <CheckCircle2 className="w-4 h-4" /> Saved!
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

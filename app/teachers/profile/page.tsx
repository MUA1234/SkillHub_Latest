'use client';

import { useState } from 'react';
import { KidCard } from '@/components/ui/kid-card';
import ProfileEditor, { TextField, Field } from '@/components/ui/profile-editor';
import { apiClient } from '@/lib/api';

interface TeacherExtras {
  title: string;
  specialization: string;
  hourly_rate: string;
  experience_years: string;
  teaching_style: string;
  languages: string; // comma-separated in the form
}

const EMPTY: TeacherExtras = {
  title: '', specialization: '', hourly_rate: '', experience_years: '',
  teaching_style: '', languages: '',
};

const inputCls =
  'w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition';

export default function TeacherProfilePage() {
  const [extras, setExtras] = useState<TeacherExtras>(EMPTY);
  const set = (k: keyof TeacherExtras) => (v: string) => setExtras((e) => ({ ...e, [k]: v }));

  const loadExtra = async () => {
    const resp = await apiClient.getTeacherProfile();
    const p: any = resp?.profile || {};
    setExtras({
      title: p.title || '',
      specialization: p.specialization && p.specialization !== 'General' ? p.specialization : '',
      hourly_rate: p.hourly_rate != null ? String(p.hourly_rate) : '',
      experience_years: p.experience_years != null ? String(p.experience_years) : '',
      teaching_style: p.teaching_style || '',
      languages: Array.isArray(p.languages) ? p.languages.join(', ') : '',
    });
  };

  const saveExtra = async () => {
    const payload: Record<string, any> = {
      title: extras.title || undefined,
      specialization: extras.specialization || undefined,
      teaching_style: extras.teaching_style || undefined,
    };
    if (extras.hourly_rate.trim() !== '') payload.hourly_rate = Number(extras.hourly_rate) || 0;
    if (extras.experience_years.trim() !== '') payload.experience_years = Number(extras.experience_years) || 0;
    const langs = extras.languages.split(',').map((s) => s.trim()).filter(Boolean);
    if (langs.length) payload.languages = langs;
    await apiClient.updateTeacherProfile(payload);
  };

  const roleSection = (
    <KidCard tone="cream" className="!p-6">
      <h3 className="font-display text-lg font-bold text-espresso mb-4">Teaching details</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Professional title" value={extras.title} onChange={set('title')} placeholder="e.g. Senior Mathematics Tutor" />
        <TextField label="Specialization" value={extras.specialization} onChange={set('specialization')} placeholder="e.g. Calculus & Algebra" />
        <TextField label="Hourly rate (LKR)" type="number" value={extras.hourly_rate} onChange={set('hourly_rate')} placeholder="e.g. 2500" />
        <TextField label="Years of experience" type="number" value={extras.experience_years} onChange={set('experience_years')} placeholder="e.g. 5" />
        <TextField label="Languages (comma-separated)" value={extras.languages} onChange={set('languages')} placeholder="e.g. English, Sinhala, Tamil" />
      </div>
      <div className="mt-4">
        <Field label="Teaching style">
          <textarea value={extras.teaching_style} onChange={(e) => set('teaching_style')(e.target.value)} rows={3} placeholder="Describe how you teach…" className={inputCls} />
        </Field>
      </div>
    </KidCard>
  );

  return (
    <ProfileEditor userRole="teacher" roleSection={roleSection} onLoadExtra={loadExtra} onSaveExtra={saveExtra} />
  );
}

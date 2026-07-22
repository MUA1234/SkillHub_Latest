'use client';

import { useState } from 'react';
import { KidCard } from '@/components/ui/kid-card';
import ProfileEditor, { TextField, Field } from '@/components/ui/profile-editor';
import { apiClient } from '@/lib/api';

interface SponsorExtras {
  company_name: string;
  industry: string;
  website: string;
  description: string;
}

const EMPTY: SponsorExtras = { company_name: '', industry: '', website: '', description: '' };

const inputCls =
  'w-full px-3 py-2 bg-cream-100 border-2 border-espresso/15 rounded-xl text-espresso placeholder:text-espresso/45 focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta outline-none transition';

export default function SponsorProfilePage() {
  const [extras, setExtras] = useState<SponsorExtras>(EMPTY);
  const set = (k: keyof SponsorExtras) => (v: string) => setExtras((e) => ({ ...e, [k]: v }));

  const loadExtra = async () => {
    try {
      const resp = await apiClient.getSponsorProfile();
      const p: any = resp?.profile || {};
      setExtras({
        company_name: p.company_name || '',
        industry: p.industry || '',
        website: p.website || '',
        description: p.description || '',
      });
    } catch {
      // No sponsor profile yet — leave the form empty so it can be created.
    }
  };

  const saveExtra = async () => {
    // company_name is required by the endpoint; skip the org save if it's blank
    // so a sponsor can still update their common profile fields alone.
    if (!extras.company_name.trim()) return;
    await apiClient.setupSponsorProfile({
      company_name: extras.company_name.trim(),
      industry: extras.industry || undefined,
      website: extras.website || undefined,
      description: extras.description || undefined,
    });
  };

  const roleSection = (
    <KidCard tone="cream" className="!p-6">
      <h3 className="font-display text-lg font-bold text-espresso mb-4">Organization</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Company / organization name" value={extras.company_name} onChange={set('company_name')} placeholder="e.g. Bright Futures Foundation" />
        <TextField label="Industry" value={extras.industry} onChange={set('industry')} placeholder="e.g. Education, Technology" />
        <TextField label="Website" value={extras.website} onChange={set('website')} placeholder="https://…" />
      </div>
      <div className="mt-4">
        <Field label="About the organization">
          <textarea value={extras.description} onChange={(e) => set('description')(e.target.value)} rows={3} placeholder="What does your organization do?" className={inputCls} />
        </Field>
      </div>
    </KidCard>
  );

  return (
    <ProfileEditor userRole="sponsor" roleSection={roleSection} onLoadExtra={loadExtra} onSaveExtra={saveExtra} />
  );
}

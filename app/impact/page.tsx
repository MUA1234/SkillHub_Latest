'use client';

/**
 * Phase M4 — Public impact page.
 *
 * Anyone can hit `/impact` (no auth). Drives sponsor acquisition by
 * surfacing honest aggregate stats. Renders a hero block, headline KPIs,
 * a disability-breakdown bar chart, and a top-locations list.
 *
 * Data comes from the unauthenticated `GET /api/v1/impact` endpoint. We
 * fetch via plain `fetch` (not the auth-aware apiClient) so a
 * signed-out visitor can render the page without a token round-trip.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Users,
  GraduationCap,
  Award,
  BookOpen,
  Heart,
  MapPin,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format';

interface ImpactData {
  as_of: string;
  students: { total: number; active: number; funded_via_scholarships: number };
  teachers: { verified: number };
  scholarships: { total_funded_lkr: number; total_count: number; open: number };
  courses: { published: number; completions: number };
  geography: { top_locations: Array<{ name: string; count: number }> };
  disability_breakdown: Array<{ type: string; count: number }>;
}

const DISABILITY_LABELS: Record<string, string> = {
  dyslexia: 'Dyslexia',
  adhd: 'ADHD',
  asd: 'Autism',
  hearing_impairment_deaf: 'Deaf',
  hearing_impairment_hard_of_hearing: 'Hard of Hearing',
  visual_impairment_blind: 'Blind',
  visual_impairment_low_vision: 'Low Vision',
  dysgraphia: 'Dysgraphia',
  dyscalculia: 'Dyscalculia',
};

const BAR_COLORS = [
  '#1e40af',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#be185d',
  '#65a30d',
  '#4f46e5',
];

export default function ImpactPage() {
  const [data, setData] = useState<ImpactData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${base}/api/v1/impact`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(setData)
      .catch((e) => setError(typeof e === 'string' ? e : 'Failed to load'));
  }, []);

  const breakdown = (data?.disability_breakdown || []).map((d) => ({
    name: DISABILITY_LABELS[d.type] || d.type,
    count: d.count,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream-100 via-cream-50 to-cream-50">
      {}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-terracotta/15 text-terracotta-500 rounded-full text-xs font-semibold mb-4">
            <Heart className="h-3 w-3" aria-hidden /> SkillHub Sri Lanka · Impact
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-espresso mb-4 leading-tight">
            Education that reaches every learner.
          </h1>
          <p className="text-lg text-espresso/70 max-w-2xl mx-auto">
            We connect Sri Lankan students — including poor families and differently-abled
            learners — with real teachers, supported by sponsors who care. Here's what we've
            done together.
          </p>
        </div>
      </section>

      {error && (
        <div className="max-w-3xl mx-auto px-6">
          <div className="bg-coral/10 border border-coral/30 text-coral text-sm p-3 rounded-md">
            Couldn't load the latest numbers: {error}
          </div>
        </div>
      )}

      {data && (
        <>
          {}
          <section className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <Kpi
              icon={<Users className="h-6 w-6 text-terracotta" aria-hidden />}
              label="Students"
              value={formatNumber(data.students.active || data.students.total || 0)}
              note={`${formatNumber(data.students.funded_via_scholarships || 0)} sponsor-funded`}
            />
            <Kpi
              icon={<GraduationCap className="h-6 w-6 text-forest" aria-hidden />}
              label="Verified teachers"
              value={formatNumber(data.teachers.verified)}
            />
            <Kpi
              icon={<Award className="h-6 w-6 text-mustard-500" aria-hidden />}
              label="Scholarship funding"
              value={formatCurrency(data.scholarships.total_funded_lkr || 0, {
                currency: 'LKR',
                compact: true,
              })}
              note={`${data.scholarships.open} open today`}
            />
            <Kpi
              icon={<BookOpen className="h-6 w-6 text-coral" aria-hidden />}
              label="Course completions"
              value={formatNumber(data.courses.completions)}
              note={`${data.courses.published} courses live`}
            />
          </section>

          {}
          {breakdown.length > 0 && (
            <section className="max-w-5xl mx-auto px-6 mb-12">
              <h2 className="text-2xl font-bold text-espresso mb-2">
                Who we're serving
              </h2>
              <p className="text-sm text-espresso/70 mb-4">
                Students by accessibility profile. Numbers grow as more learners join.
              </p>
              <div className="bg-cream-50 rounded-xl shadow-sm border p-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdown}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count">
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {}
          {data.geography.top_locations.length > 0 && (
            <section className="max-w-5xl mx-auto px-6 mb-12">
              <h2 className="text-2xl font-bold text-espresso mb-2 flex items-center gap-2">
                <MapPin className="h-6 w-6 text-terracotta" aria-hidden />
                Where we reach
              </h2>
              <p className="text-sm text-espresso/70 mb-4">Most-served locations.</p>
              <div className="bg-cream-50 rounded-xl shadow-sm border divide-y">
                {data.geography.top_locations.map((loc) => (
                  <div
                    key={loc.name}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <span className="font-medium text-espresso">{loc.name}</span>
                    <span className="text-espresso/55">
                      {formatNumber(loc.count)} {loc.count === 1 ? 'learner' : 'learners'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {}
          <section className="max-w-3xl mx-auto px-6 pb-16 text-center">
            <h2 className="text-2xl font-bold text-espresso mb-3">
              Want to help more students learn?
            </h2>
            <p className="text-espresso/70 mb-6">
              Sponsor a scholarship, fund a teacher, or run a campaign — every contribution
              has a measurable impact.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/auth?role=sponsor"
                className="bg-terracotta hover:bg-terracotta-500 text-white font-semibold px-6 py-3 rounded-lg shadow-sm"
              >
                Become a sponsor
              </Link>
              <Link
                href="/auth"
                className="border border-espresso/20 hover:bg-cream-100 text-espresso font-semibold px-6 py-3 rounded-lg"
              >
                Sign up as a learner
              </Link>
            </div>
            <p className="text-xs text-espresso/45 mt-6">
              Stats updated {new Date(data.as_of).toLocaleString()}.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-cream-50 rounded-xl shadow-sm border p-4">
      {icon}
      <p className="text-xs text-espresso/55 mt-2">{label}</p>
      <p className="text-2xl font-bold text-espresso">{value}</p>
      {note && <p className="text-xs text-espresso/55 mt-1">{note}</p>}
    </div>
  );
}

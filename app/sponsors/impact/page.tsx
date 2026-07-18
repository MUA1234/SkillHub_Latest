'use client';

/**
 * Phase M1 — Sponsor impact dashboard.
 *
 * Sponsor-scoped charts:
 *   - KPI tiles: scholarships count + total funded + students funded +
 *     completion rate
 *   - Funded-trend line (grants minted per month)
 *   - Disability breakdown bar chart
 *   - Geographic spread list
 *
 * Built on top of `GET /api/v1/sponsors/impact-summary`. The legacy
 * `/sponsors/analytics` page keeps its existing shape; this is a new
 * surface focused on outcome data rather than campaign metrics.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Heart,
  Award,
  Users,
  CheckCircle2,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

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
];

export default function SponsorImpactPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getSponsorImpactSummary()
      .then(setData)
      .catch((e) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const breakdown = useMemo(
    () =>
      (data?.disability_breakdown || []).map((d: any) => ({
        name: DISABILITY_LABELS[d.type] || d.type,
        count: d.count,
      })),
    [data],
  );

  if (loading) {
    return <div className="p-8 text-sm text-espresso/55">Loading...</div>;
  }
  if (error || !data) {
    return (
      <div className="p-8">
        <Card className="border-coral/30 bg-coral/10">
          <CardContent className="p-4 text-coral text-sm">
            {error || 'No impact data yet.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const completionPct =
    data.students_funded.completion_rate != null
      ? `${Math.round(data.students_funded.completion_rate * 100)}%`
      : '—';

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="sponsor" userName="" userEmail="" />
      <DashboardSidebar userRole="sponsor" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Heart className="h-8 w-8 text-red-500" aria-hidden />
          <div>
            <PageHeader title="Your" accent="impact" />
            <p className="text-sm text-espresso/70">
              How your funding translates into student outcomes.
            </p>
          </div>
        </div>

        {}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi
            icon={<Award className="h-5 w-5 text-mustard-500" aria-hidden />}
            label="Scholarships"
            value={formatNumber(data.scholarships.count)}
            note={formatCurrency(data.scholarships.total_funded_lkr || 0, {
              currency: 'LKR',
              compact: true,
            })}
          />
          <Kpi
            icon={<Users className="h-5 w-5 text-terracotta" aria-hidden />}
            label="Students funded"
            value={formatNumber(data.students_funded.count)}
            note={`${data.students_funded.currently_active} active now`}
          />
          <Kpi
            icon={<CheckCircle2 className="h-5 w-5 text-forest" aria-hidden />}
            label="Completion rate"
            value={completionPct}
            note={`${data.students_funded.completed_at_least_one_course} completed ≥1 course`}
          />
          <Kpi
            icon={<TrendingUp className="h-5 w-5 text-coral" aria-hidden />}
            label="Slots filled"
            value={`${data.scholarships.slots_filled}/${data.scholarships.slots_total || 0}`}
          />
        </div>

        {}
        {data.funded_trend?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Students funded over time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.funded_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#1e3a8a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {}
        {breakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Cohort: accessibility profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdown}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={60}
                    />
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
            </CardContent>
          </Card>
        )}

        {}
        {data.geography?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-terracotta" aria-hidden />
                Geographic spread
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {data.geography.map((loc: any) => (
                  <div
                    key={loc.name}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="font-medium text-espresso">{loc.name}</span>
                    <span className="text-espresso/55">
                      {loc.count} {loc.count === 1 ? 'student' : 'students'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
        </div>
      </main>
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
    <Card>
      <CardContent className="p-4">
        {icon}
        <p className="text-xs text-espresso/55 mt-2">{label}</p>
        <p className="text-2xl font-bold text-espresso">{value}</p>
        {note && <p className="text-xs text-espresso/55 mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}

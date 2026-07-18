'use client';

/**
 * Phase M2 — Teacher analytics page.
 *
 * Surfaces the small per-period summary the new `analytics-summary`
 * endpoint returns: hours taught, students reached, completed sessions,
 * average rating, gross attributed earnings, monthly earnings trend,
 * and retention (share of students with 2+ sessions).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Clock,
  Users,
  Calendar,
  Star,
  Repeat,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

type Period = 'week' | 'month' | 'quarter' | 'year';

export default function TeacherAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getTeacherAnalyticsSummary(period)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const periods: { id: Period; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'year', label: 'Year' },
  ];

  const trend = useMemo(
    () =>
      (data?.earnings_trend || []).map((row: any) => ({
        month: row.month,
        amount: row.amount,
      })),
    [data],
  );

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="teacher" userName="" userEmail="" />
      <DashboardSidebar userRole="teacher" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-terracotta" aria-hidden />
            <div>
              <PageHeader title="Your" accent="teaching insights" />
              <p className="text-sm text-espresso/70">
                Sessions, students, and earnings at a glance.
              </p>
            </div>
          </div>
          <div className="flex gap-1 bg-cream-50 rounded-md border p-1">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 text-sm rounded ${
                  period === p.id
                    ? 'bg-terracotta text-white'
                    : 'text-espresso hover:bg-cream-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <Card className="border-coral/30 bg-coral/10">
            <CardContent className="p-3 text-sm text-coral">{error}</CardContent>
          </Card>
        )}

        {loading || !data ? (
          <p className="text-sm text-espresso/55">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi
                icon={<Clock className="h-5 w-5 text-terracotta" aria-hidden />}
                label="Hours taught"
                value={formatNumber(data.hours_taught || 0)}
              />
              <Kpi
                icon={<Users className="h-5 w-5 text-forest" aria-hidden />}
                label="Students reached"
                value={formatNumber(data.students_taught || 0)}
              />
              <Kpi
                icon={<Calendar className="h-5 w-5 text-coral" aria-hidden />}
                label="Sessions completed"
                value={formatNumber(data.completed_sessions || 0)}
              />
              <Kpi
                icon={<Star className="h-5 w-5 text-mustard-500" aria-hidden />}
                label="Avg rating"
                value={
                  data.avg_rating != null
                    ? `${data.avg_rating.toFixed(2)} ★`
                    : '—'
                }
                note={`${data.review_count || 0} reviews`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <DollarSign className="h-5 w-5 text-mustard-500 mb-2" aria-hidden />
                  <p className="text-xs text-espresso/55">Gross earnings ({period})</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(data.total_earnings_lkr || 0, { currency: 'LKR' })}
                  </p>
                  <p className="text-xs text-espresso/55 mt-1">
                    Attributed across your live sessions.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <Repeat className="h-5 w-5 text-terracotta mb-2" aria-hidden />
                  <p className="text-xs text-espresso/55">Student retention</p>
                  <p className="text-2xl font-bold">
                    {data.student_retention != null
                      ? `${Math.round(data.student_retention * 100)}%`
                      : '—'}
                  </p>
                  <p className="text-xs text-espresso/55 mt-1">
                    Returned for 2+ sessions.
                  </p>
                </CardContent>
              </Card>
            </div>

            {}
            <Card>
              <CardHeader>
                <CardTitle>Monthly earnings</CardTitle>
              </CardHeader>
              <CardContent>
                {trend.length === 0 ? (
                  <p className="text-sm text-espresso/55">
                    No completed payments yet for this period.
                  </p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(value: any) =>
                            formatCurrency(Number(value) || 0, { currency: 'LKR' })
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="amount"
                          stroke="#1e3a8a"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
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

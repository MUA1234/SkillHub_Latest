'use client';

/**
 * Phase L2 — Admin dashboard.
 *
 * Surfaces platform stats: users by role, courses, revenue, sponsorship
 * totals, pending teachers, open reports. Read-only — moderation actions
 * live on /admin/teachers and /admin/reports.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Users,
  BookOpen,
  DollarSign,
  Award,
  GraduationCap,
  AlertTriangle,
  ShieldCheck,
  Bell,
  Loader2,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);

  const handleSendReminders = async () => {
    if (sendingReminders) return;
    setSendingReminders(true);
    setReminderResult(null);
    try {
      const r = await apiClient.sendSessionRemindersNow(30);
      const sessions = r?.sessions_found ?? 0;
      if (sessions === 0) {
        setReminderResult('No sessions in the next 30 minutes — nothing to send.');
      } else {
        setReminderResult(
          `Queued ${r.emails_queued ?? 0} email(s) and sent ${r.sms_sent ?? 0} SMS for ${sessions} session(s).`,
        );
      }
    } catch (e: any) {
      setReminderResult(`Failed: ${e?.message || 'unknown error'}`);
    } finally {
      setSendingReminders(false);
    }
  };

  useEffect(() => {
    apiClient
      .getAdminDashboard()
      .then((r) => setData(r))
      .catch((e) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-espresso/55">Loading...</div>;
  }
  if (error) {
    return (
      <div className="p-8">
        <Card className="border-coral/30 bg-coral/10">
          <CardContent className="p-4 text-coral text-sm">{error}</CardContent>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-terracotta" aria-hidden />
          <div>
            <PageHeader title="Admin" accent="control room" />
            <p className="text-sm text-espresso/70">Platform health at a glance.</p>
          </div>
        </div>

        {}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <Users className="h-6 w-6 text-terracotta mb-2" aria-hidden />
              <p className="text-xs text-espresso/55">Total users</p>
              <p className="text-2xl font-bold">{data.users?.total ?? 0}</p>
              <p className="text-xs text-espresso/55 mt-1">
                {data.users?.verified ?? 0} verified · {data.users?.active ?? 0} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <BookOpen className="h-6 w-6 text-forest mb-2" aria-hidden />
              <p className="text-xs text-espresso/55">Courses</p>
              <p className="text-2xl font-bold">{data.courses?.total ?? 0}</p>
              <p className="text-xs text-espresso/55 mt-1">{data.courses?.active ?? 0} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <DollarSign className="h-6 w-6 text-mustard-500 mb-2" aria-hidden />
              <p className="text-xs text-espresso/55">Revenue</p>
              <p className="text-2xl font-bold">
                {formatCurrency(data.revenue?.total || 0, { currency: 'LKR' })}
              </p>
              <p className="text-xs text-espresso/55 mt-1">
                Demo: {formatCurrency(data.revenue?.demo || 0, { currency: 'LKR' })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Award className="h-6 w-6 text-coral mb-2" aria-hidden />
              <p className="text-xs text-espresso/55">Scholarships</p>
              <p className="text-2xl font-bold">{data.scholarships?.total ?? 0}</p>
              <p className="text-xs text-espresso/55 mt-1">
                {data.scholarships?.open ?? 0} open ·{' '}
                {formatCurrency(data.scholarships?.total_value_lkr || 0, { currency: 'LKR' })}
              </p>
            </CardContent>
          </Card>
        </div>

        {}
        <Card>
          <CardHeader>
            <CardTitle>Users by role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.users?.by_role || {}).map(([role, count]: any) => (
                <Badge key={role} variant="outline" className="text-sm">
                  {role}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-terracotta" aria-hidden />
                Pending teacher verifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-2">{data.moderation?.pending_teachers ?? 0}</p>
              <Link href="/admin/teachers">
                <Button variant="outline">Review queue</Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-coral" aria-hidden />
                Open reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold mb-2">{data.moderation?.open_reports ?? 0}</p>
              <Link href="/admin/reports">
                <Button variant="outline">View reports</Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-forest" aria-hidden />
                Teacher payouts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-espresso/70 mb-2">
                Queue and reconcile manual bank transfers.
              </p>
              <Link href="/admin/payouts">
                <Button variant="outline">Manage payouts</Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-mustard-500" aria-hidden />
                Session reminders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-espresso/70 mb-2">
                Email + SMS for sessions starting in the next 30 minutes.
                Normally driven by an external scheduler; use this for a
                manual nudge or quick verification.
              </p>
              <Button
                variant="outline"
                onClick={handleSendReminders}
                disabled={sendingReminders}
                className="inline-flex items-center"
              >
                {sendingReminders ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Bell className="w-4 h-4 mr-2" />
                )}
                {sendingReminders ? 'Sending…' : 'Send reminders now'}
              </Button>
              {reminderResult && (
                <p
                  className="text-xs text-espresso/70 mt-2"
                  role="status"
                  aria-live="polite"
                >
                  {reminderResult}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

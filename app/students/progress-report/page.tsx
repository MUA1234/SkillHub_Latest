'use client';

/**
 * Phase M3 — Student progress report download page.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Accessibility } from 'lucide-react';
import { apiClient } from '@/lib/api';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function ProgressReportPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [busy, setBusy] = useState(false);
  const [busyA11y, setBusyA11y] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.downloadProgressReport(period);
    } catch (e: any) {
      setError(e?.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadA11y = async () => {
    setBusyA11y(true);
    setError(null);
    try {
      await apiClient.downloadAccessibilityProgressReport(period);
    } catch (e: any) {
      setError(e?.message || 'Download failed');
    } finally {
      setBusyA11y(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-terracotta" aria-hidden />
              <div>
                <CardTitle>Progress report</CardTitle>
                <p className="text-sm text-espresso/70">
                  A short PDF summary of your recent learning.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Period</p>
              <div className="flex gap-2">
                {(['week', 'month'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 text-sm rounded border ${
                      period === p
                        ? 'bg-terracotta text-white border-blue-600'
                        : 'bg-cream-50 text-espresso border-espresso/20 hover:bg-cream-100'
                    }`}
                  >
                    {p === 'week' ? 'Past 7 days' : 'Past 30 days'}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div className="text-sm text-coral bg-coral/10 border border-coral/30 rounded p-2">
                {error}
              </div>
            )}
            <Button onClick={download} disabled={busy} className="w-full">
              <Download className="h-4 w-4 mr-2" aria-hidden />
              {busy ? 'Generating...' : 'Download PDF'}
            </Button>
            <p className="text-xs text-espresso/55">
              The report covers sessions attended, hours studied, course progress, and quiz
              performance. You can share it with a guardian or teacher.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Accessibility className="h-8 w-8 text-coral" aria-hidden />
              <div>
                <CardTitle>Accessibility progress report</CardTitle>
                <p className="text-sm text-espresso/70">
                  Which accessibility features you used over the period and how often.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={downloadA11y}
              disabled={busyA11y}
              className="w-full"
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" aria-hidden />
              {busyA11y ? 'Generating...' : 'Download accessibility PDF'}
            </Button>
            <p className="text-xs text-espresso/55">
              Helpful for guardians and teachers to see whether the accessibility setup
              is actually being used.
            </p>
          </CardContent>
        </Card>
      </div>
        </div>
      </main>
    </div>
  );
}

'use client';

/**
 * Student session recordings — full archive.
 *
 * The dashboard's "Catch up on recordings" card only surfaces the
 * most-recent few via the dashboard's `recent_recordings` payload.
 * Older recordings were unreachable: apiClient.getSessionRecordings
 * (GET /api/v1/students/session-recordings) returned the full list
 * but had no UI caller. This page closes that loop.
 *
 * Endpoint used:
 *   GET /api/v1/students/session-recordings
 *     → { data: { recordings: [{ id, session_id, session_title,
 *         recording_url, duration, created_at }], pagination: {…} } }
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PlayCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Clock,
  Video,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface RecordingRow {
  id: string;
  session_id: string;
  session_title?: string;
  recording_url?: string;
  duration?: number | string | null;
  created_at?: string;
}

export default function StudentRecordingsPage() {
  const router = useRouter();
  const { language } = useTranslation();
  const currentUser = getCurrentUser();
  const userRole = currentUser?.role || 'student';
  const userName =
    `${currentUser?.profile?.first_name || 'Student'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';

  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    if (currentUser?.role !== 'student') {
      router.push('/auth');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.getSessionRecordings({ limit: 100 });
      const rows: RecordingRow[] =
        (resp?.data?.recordings as RecordingRow[]) ||
        (resp?.recordings as RecordingRow[]) ||
        [];
      rows.sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || '')),
      );
      setRecordings(rows);
    } catch (err: any) {
      setError(err?.message || 'Could not load recordings.');
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(
        language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK',
        { dateStyle: 'medium' },
      ).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatDuration = (raw: number | string | null | undefined) => {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    const seconds = n > 600 ? n : n * 60;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation
        userRole={userRole as 'student' | 'teacher' | 'sponsor'}
        userName={userName}
        userEmail={userEmail}
      />
      <DashboardSidebar userRole="student" />

      <div className="pt-20 pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <PageHeader title="Session" accent="recordings" />
              <p className="text-espresso/70 mt-2">
                Every live session you joined, ready to replay whenever you need a refresher.
              </p>
            </div>
            <button
              onClick={() => router.push('/students/dashboard')}
              className="clay-card px-3 py-2 text-espresso hover:bg-cream-100 inline-flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to dashboard
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-terracotta mr-3" />
              <span className="text-espresso/70">Loading recordings…</span>
            </div>
          ) : error ? (
            <div className="bg-coral/15 border border-coral text-coral px-4 py-3 rounded flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="flex-1">{error}</span>
              <button onClick={load} className="underline hover:no-underline">
                Retry
              </button>
            </div>
          ) : recordings.length === 0 ? (
            <EmptyState
              title="No recordings yet"
              body="When a teacher publishes a recording of a session you joined, it'll show up here for replay."
            />
          ) : (
            <ul className="divide-y-2 divide-espresso/10 bg-cream-50 rounded-2xl border-2 border-espresso/10 overflow-hidden">
              {recordings.map((rec) => {
                const duration = formatDuration(rec.duration);
                return (
                  <li
                    key={rec.id}
                    className="flex flex-wrap items-center gap-4 p-5 hover:bg-cream-100 transition-colors"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-300 text-cream border-2 border-espresso shrink-0">
                      <PlayCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-espresso truncate">
                        {rec.session_title || 'Recorded session'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-espresso/65 mt-0.5">
                        {rec.created_at && (
                          <span className="inline-flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            {formatDate(rec.created_at)}
                          </span>
                        )}
                        {duration && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {duration}
                          </span>
                        )}
                      </div>
                    </div>
                    {rec.recording_url ? (
                      <a
                        href={rec.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-forest-300 text-cream border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform shrink-0"
                      >
                        Watch
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-espresso/55 shrink-0">
                        URL pending
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

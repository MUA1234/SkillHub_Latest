'use client';

/**
 * Phase J3 — Offline downloads library.
 *
 * Lists every lesson saved to IndexedDB. Each row plays from the
 * cached blob via the same accessible VideoPlayer — no network round
 * trip required, so this works on a plane / in a power cut / on
 * unreliable cellular.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from '@/components/content/VideoPlayer';
import { Download, Trash2, Play, HardDrive, X } from 'lucide-react';
import {
  listOfflineLessons,
  removeOfflineLesson,
  getStorageEstimate,
  lessonBlobUrl,
  formatBytes,
  OfflineLessonRecord,
} from '@/lib/offline';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function OfflineDownloadsPage() {
  const { preferences } = useAccessibility();
  const [rows, setRows] = useState<OfflineLessonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    usageBytes: number | null;
    quotaBytes: number | null;
  }>({ usageBytes: null, quotaBytes: null });
  const [active, setActive] = useState<OfflineLessonRecord | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listOfflineLessons();
      setRows(list);
      setUsage(await getStorageEstimate());
    } catch (e: any) {
      setError(e?.message || 'Failed to read offline library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [activeUrl]);

  const playLesson = (rec: OfflineLessonRecord) => {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    const url = lessonBlobUrl(rec);
    setActiveUrl(url);
    setActive(rec);
  };

  const closePlayer = () => {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    setActiveUrl(null);
    setActive(null);
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this lesson from your offline library?')) return;
    try {
      await removeOfflineLesson(id);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove');
    }
  };

  const totalSize = rows.reduce((a, r) => a + r.sizeBytes, 0);

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <HardDrive className="h-8 w-8 text-terracotta" aria-hidden />
          <div>
            <PageHeader title="Your" accent="downloads" />
            <p className="text-sm text-espresso/70">
              Lessons saved for offline learning.
            </p>
          </div>
        </div>

        {error && (
          <Card className="border-coral/30 bg-coral/10">
            <CardContent className="p-3 text-sm text-coral">{error}</CardContent>
          </Card>
        )}

        {}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-espresso/55">Lessons saved</p>
                <p className="text-xl font-semibold">{rows.length}</p>
              </div>
              <div>
                <p className="text-xs text-espresso/55">Used by SkillHub</p>
                <p className="text-xl font-semibold">{formatBytes(totalSize)}</p>
              </div>
              <div>
                <p className="text-xs text-espresso/55">Browser storage</p>
                <p className="text-sm text-espresso">
                  {formatBytes(usage.usageBytes)} / {formatBytes(usage.quotaBytes)}
                </p>
                {usage.usageBytes != null && usage.quotaBytes ? (
                  <div className="mt-1 h-1.5 bg-cream-200 border border-espresso/10 rounded">
                    <div
                      className="h-1.5 bg-terracotta rounded"
                      style={{
                        width: `${Math.min(
                          100,
                          (usage.usageBytes / usage.quotaBytes) * 100,
                        ).toFixed(1)}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-espresso/55">Loading...</p>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <Download className="h-10 w-10 mx-auto text-espresso/45 mb-2" aria-hidden />
            <p className="text-espresso/70">
              No offline lessons yet. Open any lesson and click "Save offline" to download.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-12 h-12 bg-terracotta/10 rounded-md flex items-center justify-center">
                    <Play className="h-5 w-5 text-terracotta" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{r.title}</p>
                    <p className="text-xs text-espresso/55 truncate">
                      {r.courseTitle ? `${r.courseTitle} · ` : ''}
                      {r.teacherName || 'Teacher'} · {formatBytes(r.sizeBytes)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => playLesson(r)}>
                    <Play className="h-4 w-4 mr-1" />
                    Play
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {}
      {active && activeUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-player-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePlayer();
          }}
        >
          <div className="bg-cream-50 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 p-4 border-b border-espresso/15">
              <div className="flex-1 min-w-0">
                <h2
                  id="offline-player-title"
                  className="text-lg font-semibold text-espresso truncate"
                >
                  {active.title}
                </h2>
                <p className="text-xs text-espresso/55 truncate">
                  Playing from offline copy · {formatBytes(active.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={closePlayer}
                className="p-1 rounded hover:bg-cream-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <VideoPlayer
                src={activeUrl}
                title={active.title}
                captionUrl={active.captionUrl}
                transcriptUrl={active.transcriptUrl}
                initialAudioOnly={!!preferences.low_bandwidth_mode}
              />
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}

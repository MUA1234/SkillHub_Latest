'use client';

/**
 * Phase I4 — Student certificates page.
 *
 * Lists every completed enrollment with a download button that streams a
 * freshly-generated PDF via the certificates endpoint. No client-side
 * caching of the PDF — re-clicking the button re-fetches so a profile
 * rename or fixed typo flows through immediately.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Award, Download, GraduationCap, Calendar, User as UserIcon } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useLanguage } from '@/contexts/LanguageContext';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';

interface CertificateRow {
  enrollment_id: string;
  course_id: string;
  course_title: string;
  teacher_name: string;
  completed_at?: string | null;
  progress_percentage?: number | null;
}

export default function CertificatesPage() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listMyCertificates()
      .then((res) => {
        if (!cancelled) setRows(res.certificates || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load certificates');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    setError(null);
    try {
      await apiClient.downloadCertificate(id, language || undefined);
    } catch (e: any) {
      setError(e?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(
        language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK',
        { year: 'numeric', month: 'long', day: 'numeric' },
      );
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Your shiny new"
          accent="certificates"
          body={t('certificates.subtitle', 'Download a certificate for every course you have completed.')}
          eyebrow="Achievements"
        />

        {error && (
          <KidCard tone="cream" className="!p-4 border-coral">
            <p className="text-sm text-coral font-semibold">{error}</p>
          </KidCard>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <KidCard key={i} tone="cream" className="animate-pulse !p-5">
                <div className="h-5 bg-espresso/10 rounded w-2/3 mb-3" />
                <div className="h-4 bg-espresso/10 rounded w-1/2 mb-2" />
                <div className="h-4 bg-espresso/10 rounded w-1/3" />
              </KidCard>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            illustration="empty-certificates"
            title={t('certificates.empty.title', 'No certificates yet')}
            body={t('certificates.empty.body', 'Finish a course to earn your first certificate.')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map((row, idx) => {
              const tones: any[] = ['cream', 'mustard', 'cream', 'forest'];
              const tilts: any[] = ['left', 'right', 'left', 'right'];
              const tone = tones[idx % tones.length];
              const onDark = tone === 'forest';
              return (
                <KidCard key={row.enrollment_id} tone={tone} tilt={tilts[idx % tilts.length]} sticker>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`grid h-11 w-11 place-items-center rounded-2xl shrink-0 ${onDark ? 'bg-cream/15 text-cream' : 'bg-espresso text-mustard'}`}>
                        <Award className="w-5 h-5" />
                      </div>
                      <h3 className="font-display text-lg font-bold leading-tight line-clamp-2">
                        {row.course_title}
                      </h3>
                    </div>
                    <TagPill tone={onDark ? 'cream' : 'forest'}>
                      <Award className="h-3 w-3" />
                      {t('content.completed', 'Done')}
                    </TagPill>
                  </div>
                  <div className={`space-y-1.5 text-sm mb-5 ${onDark ? 'text-cream/85' : 'text-espresso/70'}`}>
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      <span>{t('certificates.taughtBy', 'Taught by')}: {row.teacher_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{t('certificates.completedOn', 'Completed')}: {formatDate(row.completed_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(row.enrollment_id)}
                    disabled={downloadingId === row.enrollment_id}
                    className={`inline-flex items-center justify-center gap-2 w-full rounded-full px-4 py-2.5 text-sm font-bold border-2 transition-colors disabled:opacity-60 ${onDark ? 'bg-cream text-espresso border-cream hover:bg-cream-100' : 'bg-espresso text-cream border-espresso hover:bg-espresso-600'}`}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingId === row.enrollment_id
                      ? t('common.loading', 'Loading...')
                      : t('certificates.download', 'Download PDF')}
                  </button>
                </KidCard>
              );
            })}
          </div>
        )}
      </div>
        </div>
      </main>
    </div>
  );
}

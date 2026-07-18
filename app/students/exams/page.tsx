'use client';

/**
 * Phase I3 — Student: Exams list.
 *
 * Lists every published exam across the student's enrolled courses. Clicking
 * an exam routes to /students/exams/[examId] for the taking experience.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileQuestion, Clock, Award, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KidCard } from '@/components/ui/kid-card';
import { TagPill } from '@/components/ui/tag-pill';

interface ExamRow {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  total_marks?: number;
  passing_marks?: number;
  attempts_allowed?: number;
}

export default function StudentExamsPage() {
  const { t } = useTranslation();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .listStudentExams()
      .then((r) => setExams(r.exams || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          eyebrow="Exams"
          title="Ready for an"
          accent="exam?"
          body={t('exams.student.subtitle', 'Quizzes and exams from your courses.')}
        />

        {loading ? (
          <KidCard tone="cream" className="!p-10 text-center text-sm text-espresso/55">
            {t('common.loading', 'Loading...')}
          </KidCard>
        ) : exams.length === 0 ? (
          <EmptyState
            illustration="exam-prep"
            title={t('exams.student.empty', 'No exams available yet')}
            body="When your teachers publish exams they'll show up here."
          />
        ) : (
          <div className="space-y-3">
            {exams.map((exam, idx) => {
              const tones: any[] = ['cream', 'mustard', 'cream', 'forest'];
              const tone = tones[idx % tones.length];
              const onDark = tone === 'forest';
              return (
                <KidCard key={exam.id} tone={tone} className="hover:-translate-y-0.5 transition-transform">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`grid h-11 w-11 place-items-center rounded-2xl shrink-0 ${onDark ? 'bg-cream/15 text-cream' : 'bg-espresso text-cream'}`}>
                        <FileQuestion className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display text-lg font-bold leading-tight">{exam.title}</h3>
                        {exam.description && (
                          <p className={`text-sm mt-0.5 line-clamp-2 ${onDark ? 'opacity-80' : 'text-espresso/70'}`}>{exam.description}</p>
                        )}
                        <div className={`flex flex-wrap gap-2 mt-2 text-xs ${onDark ? 'text-cream/75' : 'text-espresso/65'}`}>
                          <TagPill tone={onDark ? 'cream' : 'mustard'} icon={<Clock className="w-3 h-3" />}>
                            {exam.duration_minutes || 0} {t('exams.minutes', 'min')}
                          </TagPill>
                          <TagPill tone={onDark ? 'cream' : 'terracotta'} icon={<Award className="w-3 h-3" />}>
                            {exam.total_marks || 0} {t('exams.marks', 'marks')}
                          </TagPill>
                          {(exam.attempts_allowed || 1) > 1 && (
                            <TagPill tone={onDark ? 'cream' : 'forest'}>
                              {exam.attempts_allowed} {t('exams.attempts', 'attempts')}
                            </TagPill>
                          )}
                        </div>
                      </div>
                    </div>
                    <Link href={`/students/exams/${exam.id}`} className="btn-kid-primary !py-2 !px-4 text-sm shrink-0">
                      {t('exams.student.start', 'Start')}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
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

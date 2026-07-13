'use client';

/**
 * Phase I3 — Student: Take an exam.
 *
 * Three phases: intro → in-progress → results.
 *
 * Accommodations honored:
 *   - extended_time_percentage: timer multiplied by (1 + pct/100)
 *   - large_print: body switches to `text-lg` / `text-xl`
 *   - audio_version: each question prompt has a Read-Aloud button
 *   - simplified_content: spacing tightened; one question per scroll-page hint
 *
 * Timer is a soft countdown — when it hits zero we auto-submit. The clock
 * is purely client-side; the server doesn't enforce a hard cutoff (a
 * follow-up could compare `started_at` server-side, but for an in-class
 * quiz the soft auto-submit is fine).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Clock, Award, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { ReadAloudButton } from '@/components/accessibility/ReadAloudButton';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

type Phase = 'intro' | 'in_progress' | 'results';

interface Question {
  id: string;
  type: 'mcq' | 'short_answer' | 'true_false';
  prompt: string;
  marks: number;
  options?: string[];
}

interface ExamPayload {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  duration_minutes?: number;
  total_marks?: number;
  passing_marks?: number;
  attempts_allowed: number;
  questions: Question[];
}

interface Accommodations {
  extended_time_percentage?: number;
  large_print?: boolean;
  audio_version?: boolean;
  simplified_content?: boolean;
}

function formatTime(s: number): string {
  if (s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function TakeExamPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ examId: string }>();
  const examId = params?.examId;

  const [phase, setPhase] = useState<Phase>('intro');
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [accom, setAccom] = useState<Accommodations>({});
  const [priorAttempts, setPriorAttempts] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!examId) return;
    apiClient
      .getStudentExam(examId)
      .then((r) => {
        setExam(r.exam);
        setAccom(r.accommodations || {});
        setPriorAttempts(r.prior_attempts || []);
      })
      .catch((e) => setError(e?.message || 'Failed to load exam'))
      .finally(() => setLoading(false));
  }, [examId]);

  const totalSeconds = useMemo(() => {
    if (!exam?.duration_minutes) return 0;
    const base = exam.duration_minutes * 60;
    const bonus = ((accom.extended_time_percentage || 0) / 100) * base;
    return Math.round(base + bonus);
  }, [exam, accom]);

  useEffect(() => {
    if (phase !== 'in_progress') return;
    if (timeLeft <= 0) {
      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleSubmit();
      }
      return;
    }
    const id = window.setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const start = async () => {
    if (!examId) return;
    setError(null);
    try {
      await apiClient.startExamAttempt(examId);
      setTimeLeft(totalSeconds);
      setPhase('in_progress');
    } catch (e: any) {
      setError(e?.message || 'Could not start');
    }
  };

  const handleSubmit = async () => {
    if (!examId || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiClient.submitExam(examId, answers);
      setResult(res.result);
      setPhase('results');
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (qid: string, value: any) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
  };

  const bodyClass = accom.large_print ? 'text-lg' : 'text-base';
  const spacingClass = accom.simplified_content ? 'space-y-8' : 'space-y-6';

  if (loading) {
    return (
      <div className="p-8 text-sm text-espresso/55">{t('common.loading', 'Loading...')}</div>
    );
  }
  if (error || !exam) {
    return (
      <div className="p-8">
        <Card className="border-coral/30 bg-coral/10">
          <CardContent className="p-4 text-coral text-sm">
            {error || t('exams.notFound', 'Exam not found.')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedAttempts = priorAttempts.filter(
    (p) => p.status === 'graded' || p.status === 'submitted' || p.status === 'needs_review',
  ).length;
  const attemptsRemaining = (exam.attempts_allowed || 1) - completedAttempts;

  if (phase === 'intro') {
    return (
      <div className={`min-h-screen bg-cream-100 py-8 px-4 ${bodyClass}`}>
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{exam.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {exam.description && <p className="text-espresso">{exam.description}</p>}
              {exam.instructions && (
                <div className="p-3 bg-terracotta/10 border border-terracotta/30 rounded-md text-sm text-espresso">
                  <strong>{t('exams.instructions', 'Instructions')}:</strong>{' '}
                  {exam.instructions}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="p-3 bg-cream-100 rounded-md">
                  <Clock className="h-4 w-4 mb-1 text-terracotta" />
                  <p className="text-xs text-espresso/55">{t('exams.duration', 'Duration')}</p>
                  <p className="font-semibold">
                    {Math.round(totalSeconds / 60)} {t('exams.minutes', 'min')}
                  </p>
                </div>
                <div className="p-3 bg-cream-100 rounded-md">
                  <Award className="h-4 w-4 mb-1 text-mustard-500" />
                  <p className="text-xs text-espresso/55">{t('exams.marks', 'Marks')}</p>
                  <p className="font-semibold">{exam.total_marks || 0}</p>
                </div>
                <div className="p-3 bg-cream-100 rounded-md">
                  <p className="text-xs text-espresso/55">{t('exams.questions', 'Questions')}</p>
                  <p className="font-semibold">{exam.questions.length}</p>
                </div>
                <div className="p-3 bg-cream-100 rounded-md">
                  <p className="text-xs text-espresso/55">{t('exams.attemptsRemaining', 'Attempts left')}</p>
                  <p className="font-semibold">{attemptsRemaining}</p>
                </div>
              </div>

              {(accom.extended_time_percentage || accom.large_print || accom.audio_version) && (
                <div className="p-3 bg-forest/10 border border-forest/30 rounded-md text-sm text-green-900">
                  <p className="font-semibold mb-1">
                    {t('exams.accommodations', 'Your accommodations')}
                  </p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    {accom.extended_time_percentage ? (
                      <li>
                        {t('exams.accom.extendedTime', 'Extended time')}: +
                        {accom.extended_time_percentage}%
                      </li>
                    ) : null}
                    {accom.large_print && <li>{t('exams.accom.largePrint', 'Large print')}</li>}
                    {accom.audio_version && (
                      <li>{t('exams.accom.audioVersion', 'Read-aloud available per question')}</li>
                    )}
                  </ul>
                </div>
              )}

              <Button
                onClick={start}
                disabled={attemptsRemaining <= 0}
                className="w-full"
              >
                {attemptsRemaining <= 0
                  ? t('exams.noAttempts', 'No attempts remaining')
                  : t('exams.startNow', 'Start exam')}
              </Button>

              {priorAttempts.length > 0 && (
                <div className="text-xs text-espresso/55">
                  <p className="font-semibold mb-1">
                    {t('exams.priorAttempts', 'Prior attempts')}:
                  </p>
                  <ul className="space-y-1">
                    {priorAttempts.map((p) => (
                      <li key={p.id}>
                        #{p.attempt_number} — {p.percentage ?? '—'}% ({p.status})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (phase === 'in_progress') {
    return (
      <div className={`min-h-screen bg-cream-100 py-6 px-4 ${bodyClass}`}>
        <div className="max-w-3xl mx-auto">
          {}
          <div className="sticky top-0 z-10 mb-4 bg-cream-50 border rounded-lg p-3 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-terracotta" />
              <span className="font-mono font-semibold">{formatTime(timeLeft)}</span>
              <span className="text-espresso/55">
                / {Math.round(totalSeconds / 60)} {t('exams.minutes', 'min')}
              </span>
            </div>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? t('common.loading', 'Loading...') : t('exams.submit', 'Submit')}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{exam.title}</CardTitle>
            </CardHeader>
            <CardContent className={spacingClass}>
              {exam.questions.map((q, idx) => (
                <div key={q.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="font-semibold text-espresso/55">{idx + 1}.</span>
                      <p className="font-medium">{q.prompt}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {accom.audio_version && (
                        <ReadAloudButton getText={() => q.prompt} compact />
                      )}
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {q.marks} {t('exams.marks', 'marks')}
                      </Badge>
                    </div>
                  </div>
                  <div className="ml-6">
                    {q.type === 'mcq' && q.options && (
                      <div className="space-y-1.5">
                        {q.options.map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-2 p-2 rounded hover:bg-cream-100 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={opt}
                              checked={answers[q.id] === opt}
                              onChange={() => setAnswer(q.id, opt)}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {q.type === 'true_false' && (
                      <div className="flex gap-4">
                        {['True', 'False'].map((v) => (
                          <label
                            key={v}
                            className="flex items-center gap-2 p-2 rounded hover:bg-cream-100 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={v}
                              checked={answers[q.id] === v}
                              onChange={() => setAnswer(q.id, v)}
                            />
                            <span>{v}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {q.type === 'short_answer' && (
                      <Textarea
                        rows={3}
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={t('exams.shortAnswer.placeholder', 'Type your answer...')}
                      />
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="mt-4 flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? t('common.loading', 'Loading...') : t('exams.submit', 'Submit')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-cream-100 py-8 px-4 ${bodyClass}`}>
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {result?.is_passed ? (
                <CheckCircle2 className="h-10 w-10 text-forest" aria-hidden />
              ) : result?.needs_review ? (
                <AlertCircle className="h-10 w-10 text-mustard-500" aria-hidden />
              ) : (
                <XCircle className="h-10 w-10 text-coral" aria-hidden />
              )}
              <div>
                <CardTitle className="text-2xl">
                  {result?.needs_review
                    ? t('exams.result.pendingReview', 'Submitted — pending review')
                    : result?.is_passed
                    ? t('exams.result.passed', 'Passed!')
                    : t('exams.result.failed', 'Not passed')}
                </CardTitle>
                <p className="text-sm text-espresso/70">
                  {result?.marks_obtained ?? 0} / {result?.total_marks ?? 0} ·{' '}
                  {result?.percentage ?? 0}%
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {result?.needs_review && (
              <p className="text-sm text-mustard-500 bg-mustard/15 p-3 rounded-md border border-amber-200">
                {t(
                  'exams.result.shortAnswerNote',
                  'Short-answer responses will be reviewed by your teacher. Your final score may change.',
                )}
              </p>
            )}
            <Button variant="outline" onClick={() => router.push('/students/exams')}>
              {t('exams.result.backToList', 'Back to exams')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

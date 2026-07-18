'use client';

/**
 * Phase I3 — Teacher: Exam authoring page.
 *
 * Lists the teacher's exams + provides a modal-driven create flow. Editing
 * an existing exam is supported via the same modal in "edit" mode. The
 * inline question editor accepts MCQ, True/False, and Short-Answer types.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Eye, BookOpen, X, FileQuestion, Users, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

interface Question {
  id: string;
  type: 'mcq' | 'short_answer' | 'true_false';
  prompt: string;
  marks: number;
  options?: string[];
  correct_answer?: any;
  explanation?: string;
}

interface ExamRow {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  total_marks?: number;
  is_published?: boolean;
  status?: string;
  questions?: Question[];
  attempts_allowed?: number;
}

function newId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const BLANK_QUESTION: Question = {
  id: '',
  type: 'mcq',
  prompt: '',
  marks: 1,
  options: ['', ''],
  correct_answer: '',
};

export default function TeacherExamsPage() {
  const { t } = useTranslation();
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExamRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<any[]>([]);

  const [form, setForm] = useState({
    course_id: '',
    title: '',
    description: '',
    instructions: '',
    duration_minutes: 30,
    passing_marks: 0,
    attempts_allowed: 1,
    accepts_short_answer: false,
    randomize_questions: false,
  });
  const [questions, setQuestions] = useState<Question[]>([]);

  const [submissionsModal, setSubmissionsModal] = useState<{
    open: boolean;
    exam: ExamRow | null;
    rows: any[];
    loading: boolean;
    error: string | null;
  }>({ open: false, exam: null, rows: [], loading: false, error: null });

  const openSubmissions = async (exam: ExamRow) => {
    setSubmissionsModal({ open: true, exam, rows: [], loading: true, error: null });
    try {
      const res = await apiClient.listExamSubmissions(exam.id);
      setSubmissionsModal((s) => ({
        ...s,
        rows: res.submissions || [],
        loading: false,
      }));
    } catch (e: any) {
      setSubmissionsModal((s) => ({
        ...s,
        loading: false,
        error: e?.message || 'Could not load submissions.',
      }));
    }
  };

  const closeSubmissions = () =>
    setSubmissionsModal({ open: false, exam: null, rows: [], loading: false, error: null });

  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiClient.listTeacherExams();
      setExams(res.exams || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    apiClient
      .getTeacherCourses()
      .then((r: any) => setCourses(r?.courses || r?.data?.courses || []))
      .catch(() => setCourses([]));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      course_id: courses[0]?.id || '',
      title: '',
      description: '',
      instructions: '',
      duration_minutes: 30,
      passing_marks: 0,
      attempts_allowed: 1,
      accepts_short_answer: false,
      randomize_questions: false,
    });
    setQuestions([]);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = async (exam: ExamRow) => {
    try {
      const res = await apiClient.getTeacherExam(exam.id);
      const e = res.exam;
      setEditing(e);
      setForm({
        course_id: e.course_id,
        title: e.title || '',
        description: e.description || '',
        instructions: e.instructions || '',
        duration_minutes: e.duration_minutes || 30,
        passing_marks: e.passing_marks || 0,
        attempts_allowed: e.attempts_allowed || 1,
        accepts_short_answer: !!e.accepts_short_answer,
        randomize_questions: !!e.randomize_questions,
      });
      setQuestions((e.questions || []).map((q: Question) => ({ ...q, id: q.id || newId() })));
      setError(null);
      setModalOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load exam');
    }
  };

  const addQuestion = (type: Question['type']) => {
    const base: Question = {
      ...BLANK_QUESTION,
      id: newId(),
      type,
      options: type === 'mcq' ? ['', ''] : type === 'true_false' ? ['True', 'False'] : undefined,
      correct_answer: type === 'true_false' ? 'True' : '',
    };
    setQuestions((qs) => [...qs, base]);
  };

  const updateQ = (idx: number, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const removeQ = (idx: number) => {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  };

  const totalMarks = questions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0);

  const save = async (publish: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        questions: questions.map((q) => ({
          id: q.id || newId(),
          type: q.type,
          prompt: q.prompt,
          marks: Number(q.marks) || 0,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        })),
      };
      if (editing) {
        await apiClient.updateExam(editing.id, { ...payload, is_published: publish });
      } else {
        const created = await apiClient.createExam(payload);
        if (publish && created?.exam?.id) {
          await apiClient.updateExam(created.exam.id, { is_published: true });
        }
      }
      setModalOpen(false);
      await reload();
    } catch (err: any) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (exam: ExamRow) => {
    try {
      await apiClient.updateExam(exam.id, { is_published: !exam.is_published });
      await reload();
    } catch (err: any) {
      setError(err?.message || 'Update failed');
    }
  };

  const remove = async (exam: ExamRow) => {
    if (!confirm(t('exams.confirmDelete', 'Delete this exam? This cannot be undone.'))) return;
    try {
      await apiClient.deleteExam(exam.id);
      await reload();
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 py-8 px-4 sm:px-6 lg:px-8">
      <AuthenticatedNavigation userRole="teacher" userName="" userEmail="" />
      <DashboardSidebar userRole="teacher" />
      <main className="pt-16 sm:pt-16 lg:pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileQuestion className="h-8 w-8 text-terracotta" aria-hidden />
            <div>
              <PageHeader title="Your" accent="exams" />
              <p className="text-sm text-espresso/70">
                {t('exams.teacher.subtitle', 'Create assessments for your courses.')}
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" aria-hidden />
            {t('exams.teacher.create', 'New exam')}
          </Button>
        </div>

        {error && (
          <Card className="mb-4 border-coral/30 bg-coral/10">
            <CardContent className="p-3 text-sm text-coral">{error}</CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-espresso/55">{t('common.loading', 'Loading...')}</p>
        ) : exams.length === 0 ? (
          <Card className="p-10 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-espresso/45 mb-3" aria-hidden />
            <p className="text-espresso/70">
              {t('exams.teacher.empty', 'No exams yet. Create one to get started.')}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {exams.map((exam) => (
              <Card key={exam.id}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-espresso truncate">{exam.title}</h3>
                      <Badge
                        variant="outline"
                        className={
                          exam.is_published
                            ? 'bg-forest/10 border-forest/30 text-forest-500'
                            : 'bg-cream-100 border-espresso/15 text-espresso/70'
                        }
                      >
                        {exam.is_published
                          ? t('exams.status.published', 'Published')
                          : t('exams.status.draft', 'Draft')}
                      </Badge>
                    </div>
                    <p className="text-xs text-espresso/55">
                      {(exam.questions?.length || 0)} {t('exams.questions', 'questions')} · {exam.total_marks || 0}{' '}
                      {t('exams.marks', 'marks')} · {exam.duration_minutes || 0}{' '}
                      {t('exams.minutes', 'min')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSubmissions(exam)}
                      title={t('exams.teacher.submissions', 'View submissions')}
                    >
                      <Users className="h-4 w-4 mr-1" aria-hidden />
                      {t('exams.teacher.submissions', 'Submissions')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => togglePublish(exam)}>
                      <Eye className="h-4 w-4 mr-1" aria-hidden />
                      {exam.is_published
                        ? t('exams.teacher.unpublish', 'Unpublish')
                        : t('exams.teacher.publish', 'Publish')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(exam)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => remove(exam)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-modal-title"
        >
          <div className="bg-cream-50 rounded-3xl shadow-kid-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 id="exam-modal-title" className="text-lg font-semibold">
                {editing
                  ? t('exams.teacher.editTitle', 'Edit exam')
                  : t('exams.teacher.createTitle', 'New exam')}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-cream-100"
                aria-label={t('common.close', 'Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <Label>{t('exams.form.course', 'Course')}</Label>
                <select
                  value={form.course_id}
                  onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  disabled={!!editing}
                >
                  <option value="">{t('exams.form.selectCourse', 'Select a course')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t('exams.form.title', 'Title')}</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('exams.form.description', 'Description')}</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('exams.form.instructions', 'Instructions to students')}</Label>
                <Textarea
                  rows={2}
                  value={form.instructions}
                  onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>{t('exams.form.duration', 'Duration (min)')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.duration_minutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value || '0', 10) }))
                    }
                  />
                </div>
                <div>
                  <Label>{t('exams.form.passingMarks', 'Pass marks')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.passing_marks}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, passing_marks: parseInt(e.target.value || '0', 10) }))
                    }
                  />
                </div>
                <div>
                  <Label>{t('exams.form.attempts', 'Attempts allowed')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.attempts_allowed}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, attempts_allowed: parseInt(e.target.value || '1', 10) }))
                    }
                  />
                </div>
              </div>

              {}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">
                    {t('exams.form.questionsHeading', 'Questions')} · {totalMarks}{' '}
                    {t('exams.marks', 'marks')}
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => addQuestion('mcq')}>
                      + MCQ
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addQuestion('true_false')}>
                      + T/F
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addQuestion('short_answer')}>
                      + {t('exams.form.short', 'Short')}
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <Card key={q.id} className="bg-cream-100">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-xs">
                            {q.type.toUpperCase().replace('_', ' ')}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">{t('exams.marks', 'Marks')}</Label>
                            <Input
                              type="number"
                              min={0}
                              className="w-20"
                              value={q.marks}
                              onChange={(e) =>
                                updateQ(idx, { marks: parseInt(e.target.value || '0', 10) })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => removeQ(idx)}
                              className="p-1 rounded hover:bg-coral/10 text-coral"
                              aria-label={t('common.delete', 'Delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <Textarea
                          rows={2}
                          placeholder={t('exams.form.prompt', 'Question text')}
                          value={q.prompt}
                          onChange={(e) => updateQ(idx, { prompt: e.target.value })}
                        />
                        {q.type === 'mcq' && q.options && (
                          <div className="space-y-1">
                            {q.options.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  checked={q.correct_answer === opt}
                                  onChange={() => updateQ(idx, { correct_answer: opt })}
                                  aria-label={t('exams.form.markCorrect', 'Mark as correct answer')}
                                />
                                <Input
                                  value={opt}
                                  onChange={(e) => {
                                    const next = [...(q.options || [])];
                                    next[oi] = e.target.value;
                                    const wasCorrect = q.correct_answer === opt;
                                    updateQ(idx, {
                                      options: next,
                                      correct_answer: wasCorrect ? e.target.value : q.correct_answer,
                                    });
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQ(idx, {
                                      options: (q.options || []).filter((_, i) => i !== oi),
                                    })
                                  }
                                  className="p-1 text-espresso/55 hover:text-coral"
                                  aria-label={t('common.delete', 'Delete option')}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateQ(idx, { options: [...(q.options || []), ''] })
                              }
                            >
                              + {t('exams.form.option', 'Option')}
                            </Button>
                          </div>
                        )}
                        {q.type === 'true_false' && (
                          <div className="flex gap-4 text-sm">
                            {['True', 'False'].map((v) => (
                              <label key={v} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  checked={q.correct_answer === v}
                                  onChange={() => updateQ(idx, { correct_answer: v })}
                                />
                                {v}
                              </label>
                            ))}
                          </div>
                        )}
                        {q.type === 'short_answer' && (
                          <p className="text-xs text-espresso/55 italic">
                            {t(
                              'exams.form.shortNote',
                              'Short-answer responses are flagged for manual review.',
                            )}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-cream-100">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button variant="outline" onClick={() => save(false)} disabled={saving || !form.title || !form.course_id}>
                {t('exams.teacher.saveDraft', 'Save draft')}
              </Button>
              <Button onClick={() => save(true)} disabled={saving || !form.title || !form.course_id || questions.length === 0}>
                {t('exams.teacher.saveAndPublish', 'Save & publish')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {}
      {submissionsModal.open && submissionsModal.exam && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submissions-modal-title"
          onClick={closeSubmissions}
        >
          <div
            className="bg-cream-50 rounded-3xl shadow-kid-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 id="submissions-modal-title" className="text-lg font-semibold">
                  {t('exams.teacher.submissionsFor', 'Submissions')} — {submissionsModal.exam.title}
                </h2>
                <p className="text-xs text-espresso/55 mt-0.5">
                  {submissionsModal.rows.length}{' '}
                  {submissionsModal.rows.length === 1
                    ? t('exams.teacher.submission', 'submission')
                    : t('exams.teacher.submissionsLower', 'submissions')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSubmissions}
                className="p-1 rounded hover:bg-cream-100"
                aria-label={t('common.close', 'Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {submissionsModal.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-terracotta mr-2" />
                  <span className="text-sm text-espresso/70">
                    {t('common.loading', 'Loading...')}
                  </span>
                </div>
              ) : submissionsModal.error ? (
                <div className="rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
                  {submissionsModal.error}
                </div>
              ) : submissionsModal.rows.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-10 h-10 text-espresso/30 mx-auto mb-3" aria-hidden />
                  <p className="text-espresso/70">
                    {t(
                      'exams.teacher.noSubmissions',
                      'No submissions yet. Students who take the exam will appear here.',
                    )}
                  </p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-espresso/15 text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        {t('exams.teacher.student', 'Student')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        {t('exams.teacher.status', 'Status')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        {t('exams.teacher.score', 'Score')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        {t('exams.teacher.time', 'Time')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-espresso/55 uppercase tracking-wider">
                        {t('exams.teacher.submitted', 'Submitted')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-espresso/10">
                    {submissionsModal.rows.map((row: any) => {
                      const status = String(row.status || 'in_progress');
                      const StatusIcon =
                        status === 'graded'
                          ? CheckCircle2
                          : status === 'needs_review'
                            ? AlertTriangle
                            : Clock;
                      const cls =
                        status === 'graded'
                          ? 'bg-forest/15 text-forest-500'
                          : status === 'needs_review'
                            ? 'bg-mustard/20 text-mustard-500'
                            : 'bg-terracotta/15 text-terracotta';
                      const sec = Number(row.time_taken_seconds || 0);
                      const mins = sec ? Math.floor(sec / 60) : 0;
                      const remSec = sec ? sec % 60 : 0;
                      return (
                        <tr key={row.id}>
                          <td className="px-3 py-2 text-espresso">
                            {row.student_name || 'Student'}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 inline-flex items-center text-xs font-semibold rounded-full ${cls}`}
                            >
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-espresso">
                            {row.percentage != null
                              ? `${Math.round(Number(row.percentage))}%`
                              : row.marks_obtained != null
                                ? `${row.marks_obtained}`
                                : '—'}
                          </td>
                          <td className="px-3 py-2 text-espresso/70">
                            {sec ? `${mins}m ${remSec}s` : '—'}
                          </td>
                          <td className="px-3 py-2 text-espresso/70">
                            {row.submitted_at
                              ? new Date(row.submitted_at).toLocaleString()
                              : row.started_at
                                ? `Started ${new Date(row.started_at).toLocaleString()}`
                                : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}

'use client';

/**
 * Guardian dashboard — Phase H3.
 *
 * Lists every student linked to the active guardian account. Selecting a
 * student loads `/guardians/students/:id/dashboard` (H3+H4) which the
 * backend gates by the link's permission flags. The UI never tries to
 * render a section the link doesn't grant — `enrollments`, `accessibility_summary`,
 * `recent_conversations`, and `upcoming_sessions` are all conditionally
 * present based on the gating rules in `guardians.py`.
 *
 * No DashboardSidebar / AuthenticatedNavigation: those are role-typed for
 * student/teacher/sponsor and would render the wrong nav for a guardian.
 * A minimal local header + sign-out keeps the surface clean until a
 * dedicated GuardianNavigation component is built (out of H3 scope).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Accessibility,
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Loader2,
  LogOut,
  MessageSquare,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { OnboardingTour } from '@/components/OnboardingTour';

interface LinkedStudent {
  id: string;
  student_id: string;
  student?: { id: string; name: string; email?: string; avatar_url?: string };
  can_view_progress: boolean;
  can_view_grades: boolean;
  can_view_accessibility: boolean;
  can_communicate_teachers: boolean;
  can_modify_accessibility: boolean;
  relationship?: string | null;
  verified_at?: string | null;
}

interface StudentDashboard {
  student: { id: string; name: string; email?: string; avatar_url?: string };
  link: any;
  permissions: Record<string, boolean>;
  enrollments?: any[];
  enrollment_summary?: { active: number; completed: number; total: number };
  upcoming_sessions?: any[];
  accessibility_summary?: Record<string, any>;
  recent_conversations?: any[];
}

export default function GuardianDashboardPage() {
  const router = useRouter();
  const currentUser = getCurrentUser();

  const [links, setLinks] = useState<LinkedStudent[] | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    if (currentUser?.role && currentUser.role !== 'guardian') {
      router.push('/');
    }
  }, [currentUser?.role, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiClient.listLinkedStudents();
        if (cancelled) return;
        const list = Array.isArray(result?.links) ? result.links : [];
        setLinks(list);
        if (list.length > 0) {
          setSelectedStudentId(list[0].student_id);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Could not load linked students.');
        setLinks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDashboard = useCallback(async (studentId: string) => {
    setLoadingDashboard(true);
    setError('');
    try {
      const result = await apiClient.getGuardianStudentDashboard(studentId);
      setDashboard(result);
    } catch (err: any) {
      setError(err?.message || 'Could not load student dashboard.');
      setDashboard(null);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      loadDashboard(selectedStudentId);
    } else {
      setDashboard(null);
    }
  }, [selectedStudentId, loadDashboard]);

  const handleSignOut = async () => {
    try {
      await apiClient.logout?.();
    } catch {
    }
    router.push('/');
  };

  const guardianName = currentUser?.profile
    ? `${currentUser.profile.first_name || ''} ${currentUser.profile.last_name || ''}`.trim() ||
      currentUser.email
    : currentUser?.email || 'Guardian';

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="bg-cream-50 border-b border-espresso/15">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-forest/15 flex items-center justify-center text-forest-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-espresso">Guardian portal</p>
              <p className="text-xs text-espresso/55">{guardianName}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-espresso/70 hover:text-espresso hover:bg-cream-100 px-3 py-2"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 pt-4">
        <OnboardingTour role="guardian" />
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {}
        <aside className="bg-cream-50 rounded-xl border border-espresso/15 p-4 h-fit">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-espresso/55 mb-3">
            Linked students
          </h2>
          {links === null ? (
            <p className="text-sm text-espresso/55 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </p>
          ) : links.length === 0 ? (
            <div className="text-sm text-espresso/55 space-y-2">
              <p>No students are linked yet.</p>
              <p className="text-xs">
                Ask the student to add you from <em>Settings → Accessibility →
                Guardian links</em>.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {links.map((link) => {
                const isActive = link.student_id === selectedStudentId;
                return (
                  <li key={link.id}>
                    <button
                      onClick={() => setSelectedStudentId(link.student_id)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                        isActive ? 'bg-forest/10 text-forest-500' : 'text-espresso hover:bg-cream-100'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-cream-300 flex items-center justify-center text-espresso flex-shrink-0">
                        <UserIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{link.student?.name || 'Student'}</div>
                        {link.relationship && (
                          <div className="text-[11px] text-espresso/55 truncate">{link.relationship}</div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {}
        <section className="space-y-4">
          {error && (
            <div className="rounded-md border border-coral/30 bg-coral/10 p-3 text-sm text-coral flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loadingDashboard ? (
            <div className="bg-cream-50 rounded-xl border border-espresso/15 p-12 text-center text-espresso/55">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
              Loading student data…
            </div>
          ) : !dashboard ? (
            <div className="bg-cream-50 rounded-xl border border-espresso/15 p-12 text-center text-espresso/55">
              <UserIcon className="w-10 h-10 mx-auto mb-3 text-espresso/45" />
              {links && links.length === 0
                ? 'Once a student adds you as a guardian, they will appear here.'
                : 'Select a student from the left to view their dashboard.'}
            </div>
          ) : (
            <DashboardPanels
              dashboard={dashboard}
              onAccessibilityChange={async (updates) => {
                try {
                  await apiClient.updateLinkedStudentAccessibility(dashboard.student.id, updates);
                  loadDashboard(dashboard.student.id);
                } catch (err: any) {
                  setError(err?.message || 'Could not update settings.');
                }
              }}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function DashboardPanels({
  dashboard,
  onAccessibilityChange,
}: {
  dashboard: StudentDashboard;
  onAccessibilityChange: (updates: Record<string, any>) => void;
}) {
  const { student, permissions } = dashboard;

  return (
    <>
      <div className="bg-cream-50 rounded-xl border border-espresso/15 p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-forest/15 flex items-center justify-center text-forest-500">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-espresso">{student.name}</h1>
            {student.email && <p className="text-sm text-espresso/55">{student.email}</p>}
          </div>
        </div>
      </div>

      {permissions.can_view_progress && (
        <Panel
          icon={<BookOpen className="w-4 h-4" />}
          title="Course progress"
          empty={!dashboard.enrollments?.length ? 'No enrolled courses yet.' : undefined}
        >
          {dashboard.enrollment_summary && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Active" value={dashboard.enrollment_summary.active} />
              <Stat label="Completed" value={dashboard.enrollment_summary.completed} />
              <Stat label="Total" value={dashboard.enrollment_summary.total} />
            </div>
          )}
          {dashboard.enrollments && dashboard.enrollments.length > 0 && (
            <ul className="divide-y divide-espresso/10">
              {dashboard.enrollments.slice(0, 8).map((e: any) => (
                <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-espresso truncate">
                      Course: {e.course_id?.slice(0, 8) || '—'}
                    </p>
                    <p className="text-xs text-espresso/55">
                      {e.status} • last active{' '}
                      {e.last_accessed ? new Date(e.last_accessed).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-espresso flex-shrink-0">
                    {e.progress_percentage ?? 0}%
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {permissions.can_view_progress && (
        <Panel
          icon={<Calendar className="w-4 h-4" />}
          title="Upcoming live sessions"
          empty={
            !dashboard.upcoming_sessions?.length
              ? 'No upcoming sessions scheduled.'
              : undefined
          }
        >
          {dashboard.upcoming_sessions && dashboard.upcoming_sessions.length > 0 && (
            <ul className="divide-y divide-espresso/10">
              {dashboard.upcoming_sessions.map((s: any) => (
                <li key={s.id} className="py-3">
                  <p className="text-sm font-medium text-espresso">{s.title || 'Live session'}</p>
                  <p className="text-xs text-espresso/55">
                    {s.scheduled_start
                      ? new Date(s.scheduled_start).toLocaleString()
                      : 'TBD'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {permissions.can_view_accessibility && dashboard.accessibility_summary && (
        <Panel icon={<Accessibility className="w-4 h-4" />} title="Accessibility settings">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <Toggle
              label="High contrast"
              value={dashboard.accessibility_summary.high_contrast}
              editable={permissions.can_modify_accessibility}
              onChange={(v) => onAccessibilityChange({ high_contrast: v })}
            />
            <Toggle
              label="Reduced motion"
              value={dashboard.accessibility_summary.reduced_motion}
              editable={permissions.can_modify_accessibility}
              onChange={(v) => onAccessibilityChange({ reduced_motion: v })}
            />
            <Toggle
              label="Screen-reader optimized"
              value={dashboard.accessibility_summary.screen_reader_optimized}
              editable={permissions.can_modify_accessibility}
              onChange={(v) => onAccessibilityChange({ screen_reader_optimized: v })}
            />
            <Toggle
              label="Text-to-speech"
              value={dashboard.accessibility_summary.text_to_speech}
              editable={permissions.can_modify_accessibility}
              onChange={(v) => onAccessibilityChange({ text_to_speech: v })}
            />
            <Toggle
              label="Speech-to-text"
              value={dashboard.accessibility_summary.speech_to_text}
              editable={permissions.can_modify_accessibility}
              onChange={(v) => onAccessibilityChange({ speech_to_text: v })}
            />
            <ReadOnlyRow
              label="Font family"
              value={dashboard.accessibility_summary.font_family || '—'}
            />
            <ReadOnlyRow
              label="Color blind mode"
              value={dashboard.accessibility_summary.color_blind_mode || 'none'}
            />
            <ReadOnlyRow
              label="Active preset"
              value={dashboard.accessibility_summary.active_preset || 'custom'}
            />
          </ul>
          {!permissions.can_modify_accessibility && (
            <p className="text-xs text-espresso/55 mt-3">
              View-only — the student has not granted permission to change these.
            </p>
          )}
        </Panel>
      )}

      {permissions.can_communicate_teachers &&
        dashboard.recent_conversations &&
        dashboard.recent_conversations.length > 0 && (
          <Panel icon={<MessageSquare className="w-4 h-4" />} title="Recent teacher messages">
            <ul className="divide-y divide-espresso/10">
              {dashboard.recent_conversations.slice(0, 5).map((c: any) => (
                <li key={c.id} className="py-3">
                  <p className="text-sm text-espresso line-clamp-1">
                    {c.last_message || '—'}
                  </p>
                  <p className="text-xs text-espresso/55">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        )}
    </>
  );
}

function Panel({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-cream-50 rounded-xl border border-espresso/15 p-5">
      <h2 className="text-sm font-semibold text-espresso mb-4 flex items-center gap-2">
        <span className="text-forest-500">{icon}</span>
        {title}
      </h2>
      {empty ? <p className="text-sm text-espresso/55">{empty}</p> : children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-espresso/10 bg-cream-100 px-3 py-2 text-center">
      <div className="text-2xl font-semibold text-espresso">{value}</div>
      <div className="text-xs text-espresso/55">{label}</div>
    </div>
  );
}

function Toggle({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: boolean;
  editable: boolean;
  onChange: (v: boolean) => void;
}) {
  if (editable) {
    return (
      <li className="flex items-center justify-between rounded-md border border-espresso/10 px-3 py-2">
        <span className="text-espresso">{label}</span>
        <button
          type="button"
          onClick={() => onChange(!value)}
          aria-pressed={value}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            value ? 'bg-forest' : 'bg-cream-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-cream-50 transition-transform ${
              value ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between rounded-md border border-espresso/10 px-3 py-2">
      <span className="text-espresso">{label}</span>
      {value ? (
        <CheckCircle2 className="w-4 h-4 text-forest" />
      ) : (
        <span className="text-xs text-espresso/45">off</span>
      )}
    </li>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string | number }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-espresso/10 px-3 py-2">
      <span className="text-espresso">{label}</span>
      <span className="text-espresso/55 text-xs">{value}</span>
    </li>
  );
}

'use client';

/**
 * Specialist teacher dashboard — for teachers who opted to teach differently-
 * abled students. Track-aware: it renders the tracks the teacher chose and
 * shows ONLY their matching students (the backend /teachers/students endpoint
 * already enforces the track wall, so nothing here can leak a non-matching
 * student).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users, ShieldCheck, Eye, Ear, Upload, Captions, Hand, Volume2, ArrowRight, BadgeCheck,
} from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { Hero } from '@/components/ui/hero';
import { StatPill } from '@/components/ui/stat-pill';
import { TagPill } from '@/components/ui/tag-pill';
import { KidCard } from '@/components/ui/kid-card';
import { Illustration } from '@/components/ui/illustration';
import { Track, trackLabel, teacherHome } from '@/lib/accessibility-tracks';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  courseTitle: string;
  status: string;
  progress: number;
}

const TRACK_ICON: Record<Track, React.ReactNode> = {
  visual: <Eye className="w-4 h-4" />,
  hearing: <Ear className="w-4 h-4" />,
};

const TRACK_TOOLS: Record<Track, { label: string; icon: React.ReactNode; href: string }[]> = {
  visual: [
    { label: 'Upload audio-described content', icon: <Volume2 className="w-5 h-5" />, href: '/teachers/content/upload' },
    { label: 'Manage accessibility tracks', icon: <Upload className="w-5 h-5" />, href: '/teachers/accessibility-tracks' },
  ],
  hearing: [
    { label: 'Upload captioned content', icon: <Captions className="w-5 h-5" />, href: '/teachers/content/upload' },
    { label: 'Add sign-language material', icon: <Hand className="w-5 h-5" />, href: '/teachers/accessibility-tracks' },
  ],
};

export default function SpecialistTeacherDashboard() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [totals, setTotals] = useState({ total: 0, active: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const currentUser = getCurrentUser() as any;
  const userName = `${currentUser?.profile?.first_name || 'Teacher'} ${currentUser?.profile?.last_name || ''}`.trim();
  const userEmail = currentUser?.email || '';
  const teachingTracks: Track[] = (currentUser?.teaching_tracks || []).filter(
    (t: string) => t === 'visual' || t === 'hearing',
  );
  const verified = !!currentUser?.verified_specialist;

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/auth'); return; }
    const cu = getCurrentUser() as any;
    if (cu?.role !== 'teacher') { router.push('/auth'); return; }
    const tracks = (cu?.teaching_tracks || []).filter((t: string) => t === 'visual' || t === 'hearing');
    if (tracks.length === 0) { router.push('/teachers/dashboard'); return; }
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchStudents = async () => {
    try {
      setIsLoading(true);
      setError('');
      const resp = await apiClient.getTeacherStudents();
      const enrollments = resp?.enrollments || resp?.students || [];
      const rows: StudentRow[] = enrollments.map((e: any) => {
        const student = e.student || e;
        const profile = student.profile || {};
        const name = `${profile.first_name || student.first_name || ''} ${profile.last_name || student.last_name || ''}`.trim();
        return {
          id: student.id || e.student_id,
          name: name || 'Student',
          email: student.email || '',
          courseTitle: (e.course && e.course.title) || (e.courses && e.courses[0]?.title) || '—',
          status: e.status || student.status || 'active',
          progress: e.progress_percentage ?? student.average_progress ?? 0,
        };
      });
      // Dedupe by student id (a student can appear across multiple courses).
      const byId = new Map<string, StudentRow>();
      rows.forEach((r) => { if (r.id && !byId.has(r.id)) byId.set(r.id, r); });
      const unique = Array.from(byId.values());
      setStudents(unique);
      setTotals({
        total: resp?.total_students ?? unique.length,
        active: resp?.active_students ?? unique.filter((r) => r.status === 'active').length,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load your students');
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="teacher" userName={userName} userEmail={userEmail} />

      <div className="flex pt-16">
        <DashboardSidebar userRole="teacher" />

        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-8 min-h-[calc(100vh-4rem)]">
          <Hero
            eyebrow={<><ShieldCheck className="w-4" /> Specialist studio</>}
            title={
              <>Your <span className="handwritten scribble-under text-mustard">specialist</span> students</>
            }
            body="These are the students matched to your tracks. Only students on the accessibility tracks you teach appear here."
            tags={
              <>
                {teachingTracks.map((t) => (
                  <TagPill key={t} tone="mustard" icon={TRACK_ICON[t]}>{trackLabel(t)} track</TagPill>
                ))}
                {verified ? (
                  <TagPill tone="forest" icon={<BadgeCheck className="w-3.5 h-3.5" />}>Verified specialist</TagPill>
                ) : (
                  <TagPill tone="outline" className="!text-cream !border-cream/30">Verification pending</TagPill>
                )}
              </>
            }
            primaryCta={
              <Link href="/teachers/content/upload" className="btn-kid-primary">
                Upload content <ArrowRight className="w-4 h-4" />
              </Link>
            }
            secondaryCta={
              <Link href={teacherHome([])} className="btn-kid-ghost !text-cream !border-cream/25 hover:!bg-cream/10">
                General dashboard
              </Link>
            }
            media={<Illustration name="mentor" size={300} priority className="drop-shadow-2xl" />}
          />

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatPill onDark={false} tone="terracotta" badge="A" value={totals.total} label="Matched students" />
            <StatPill onDark={false} tone="forest" badge="B" value={totals.active} label="Active" />
            <StatPill onDark={false} tone="mustard" badge="C" value={teachingTracks.length} label="Tracks taught" />
            <StatPill onDark={false} tone="espresso" badge="D" value={verified ? 'Yes' : 'No'} label="Verified" />
          </section>

          {/* Track content tools */}
          <section className="space-y-4">
            <h2 className="font-display text-3xl font-bold text-espresso">Your specialist tools</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {teachingTracks.flatMap((t) =>
                TRACK_TOOLS[t].map((tool) => (
                  <Link href={tool.href} key={`${t}-${tool.label}`}>
                    <KidCard tone="cream" sticker className="h-full cursor-pointer group">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-espresso text-cream">{tool.icon}</div>
                      <h3 className="font-display font-bold text-base mt-3 text-espresso">{tool.label}</h3>
                      <p className="text-xs text-espresso/60 mt-1">{trackLabel(t)} track</p>
                    </KidCard>
                  </Link>
                )),
              )}
            </div>
          </section>

          {/* Matched students */}
          <section className="space-y-4">
            <h2 className="font-display text-3xl font-bold text-espresso">Students in your tracks</h2>

            {error && (
              <KidCard tone="cream" className="border-coral !p-5">
                <p className="font-semibold text-espresso">Couldn&apos;t load your students</p>
                <p className="text-sm text-espresso/70 mt-0.5">{error}</p>
                <button onClick={fetchStudents} className="btn-kid-primary mt-3 !py-2 !px-4 text-sm">Try again</button>
              </KidCard>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-espresso/10 animate-pulse" />)}
              </div>
            ) : students.length ? (
              <KidCard tone="espresso" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-cream/10">
                  {students.map((s) => (
                    <li key={s.id} className="flex items-center gap-4 p-5 hover:bg-cream/5 transition-colors">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-mustard text-espresso shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-cream truncate">{s.name}</p>
                        <p className="text-xs text-cream/65 truncate mt-0.5">{s.courseTitle} · {s.email}</p>
                      </div>
                      <div className="w-28 hidden sm:block">
                        <div className="h-2 rounded-full overflow-hidden bg-cream/15">
                          <div className="h-full rounded-full bg-terracotta" style={{ width: `${s.progress}%` }} />
                        </div>
                      </div>
                      <TagPill tone={s.status === 'active' ? 'mustard' : 'outline'} className={s.status !== 'active' ? '!text-cream !border-cream/30' : ''}>
                        {s.status}
                      </TagPill>
                    </li>
                  ))}
                </ul>
              </KidCard>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-12">
                <Illustration name="empty-courses" size={160} />
                <h3 className="font-display text-2xl font-bold mt-2 text-espresso">No matched students yet</h3>
                <p className="text-sm text-espresso/70 mt-1 max-w-sm">
                  When students on your {teachingTracks.map(trackLabel).join(' or ')} track enroll, they&apos;ll appear here.
                </p>
              </KidCard>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

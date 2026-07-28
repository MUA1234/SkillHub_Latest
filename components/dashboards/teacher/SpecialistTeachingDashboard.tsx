'use client';

/**
 * The Visual / Hearing teaching dashboard. Mounts INSTEAD of the normal
 * dashboard when the teaching mode is 'visual' or 'hearing' — the general
 * dashboard isn't rendered at all in these modes.
 *
 * It's a purpose-built specialist workspace: an identity banner, the one upload
 * action that matters for this track (audiobook / captioned video), the
 * teacher's students in this track (the /teachers/students endpoint enforces the
 * wall server-side), and the track lessons they've already published.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Ear, Upload, Users, Headphones, Captions, ArrowRight, PlayCircle } from 'lucide-react';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { StatPill } from '@/components/ui/stat-pill';
import { KidCard } from '@/components/ui/kid-card';
import { Illustration } from '@/components/ui/illustration';
import TeachingModeDropdown from '@/components/teacher/TeachingModeDropdown';

type Track = 'visual' | 'hearing';

interface TrackConfig {
  label: string;
  audience: string;
  banner: string;               // direct bg class (coral has no KidCard tone)
  icon: React.ReactNode;
  uploadVerb: string;
  contentNoun: string;
  emptyContent: string;
  emptyStudents: string;
  /** Which course_content row counts as this track's playable lesson. */
  isTrackItem: (row: any) => boolean;
}

const CONFIG: Record<Track, TrackConfig> = {
  visual: {
    label: 'Visually impaired students',
    audience: 'Blind & low-vision learners — audio-first',
    banner: 'bg-forest text-cream',
    icon: <Eye className="w-7 h-7" />,
    uploadVerb: 'Upload an audiobook',
    contentNoun: 'audio lessons',
    emptyContent: 'No audio lessons yet. Upload an audiobook and it appears in your students’ voice library.',
    emptyStudents: 'No visually-impaired students matched yet. They’ll show up here when they enrol or book you.',
    isTrackItem: (r) => !!r?.audio_url && r.audio_url !== 'pending',
  },
  hearing: {
    label: 'Hearing impaired students',
    audience: 'Deaf & hard-of-hearing learners — sign language',
    banner: 'bg-coral text-cream',
    icon: <Ear className="w-7 h-7" />,
    uploadVerb: 'Upload a sign-language video',
    contentNoun: 'sign-language videos',
    emptyContent: 'No sign-language videos yet. Upload a signed video and it appears in your students’ library.',
    emptyStudents: 'No hearing-impaired students matched yet. They’ll show up here when they enrol or book you.',
    isTrackItem: (r) => !!r?.sign_language_video_url && r.sign_language_video_url !== 'pending',
  },
};

interface StudentRow { id: string; name: string; email?: string }
interface ContentRow { id: string; title: string; course_title?: string; content_type?: string }

export default function SpecialistTeachingDashboard({ track }: { track: Track }) {
  const router = useRouter();
  const cfg = CONFIG[track];
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = getCurrentUser();
  const firstName = currentUser?.profile?.first_name || 'Teacher';
  const userName = `${currentUser?.profile?.first_name || 'Demo'} ${currentUser?.profile?.last_name || 'Teacher'}`.trim();
  const userEmail = currentUser?.email || 'demo@teacher.com';

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/auth'); return; }
    if (currentUser?.role !== 'teacher') { router.push('/auth'); return; }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const normalizeStudents = (resp: any): StudentRow[] => {
    const arr = Array.isArray(resp) ? resp : resp?.students || resp?.data || [];
    return (arr as any[]).map((s) => ({
      id: String(s.id || s.student_id || s.user_id || Math.random()),
      name: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email || 'Student',
      email: s.email,
    }));
  };

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [studentsResp, coursesResp] = await Promise.allSettled([
        apiClient.getTeacherStudents(),
        apiClient.getTeacherCourses(),
      ]);

      if (studentsResp.status === 'fulfilled') setStudents(normalizeStudents(studentsResp.value));

      if (coursesResp.status === 'fulfilled') {
        const cr = coursesResp.value;
        const courses: any[] = Array.isArray(cr) ? cr : cr?.courses || cr?.data || [];
        const slice = courses.slice(0, 15);
        const contents = await Promise.allSettled(
          slice.map((c) => apiClient.getTeacherContent(String(c.id))),
        );
        const rows: ContentRow[] = [];
        contents.forEach((res, i) => {
          if (res.status !== 'fulfilled') return;
          const items: any[] = res.value?.content || [];
          items.filter(cfg.isTrackItem).forEach((it) => {
            rows.push({ id: String(it.id), title: it.title || 'Untitled', course_title: slice[i]?.title, content_type: it.content_type });
          });
        });
        setContent(rows);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const studentCount = students.length;
  const lessonCount = content.length;

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="teacher" userName={userName} userEmail={userEmail} />

      <div className="flex pt-16">
        <DashboardSidebar userRole="teacher" />

        <main className="flex-1 pt-12 lg:pt-0 p-4 sm:p-6 lg:p-8 space-y-8 min-h-[calc(100vh-4rem)]">
          <TeachingModeDropdown />

          {/* Identity banner — unmistakably a different dashboard. */}
          <section className={`rounded-3xl border-2 border-espresso shadow-sticker ${cfg.banner} px-5 py-5 sm:px-7 sm:py-6`}>
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-cream/15 border-2 border-cream/30">
                {cfg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cream/80">Specialist teaching space</span>
                <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                  Teaching {cfg.label.toLowerCase()}
                </h1>
                <p className="text-cream/85 text-sm mt-0.5">{cfg.audience} · Hi {firstName}</p>
              </div>
              <Link
                href="/teachers/content/upload"
                className="hidden sm:inline-flex items-center gap-2 rounded-full bg-cream text-espresso border-2 border-espresso px-5 py-2.5 text-sm font-bold shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform shrink-0"
              >
                <Upload className="w-4 h-4" /> {cfg.uploadVerb}
              </Link>
            </div>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <StatPill onDark={false} tone="forest" badge="A" value={studentCount} label="Your students in this track" />
            <StatPill onDark={false} tone="mustard" badge="B" value={lessonCount} label={`Your ${cfg.contentNoun}`} />
            <StatPill onDark={false} tone="terracotta" badge="C" value={track === 'visual' ? 'Audio' : 'Video'} label="Accepted upload type" />
          </section>

          {/* Primary action */}
          <section>
            <KidCard tone={track === 'visual' ? 'forest' : 'espresso'} sticker className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] items-center gap-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-mustard">Add a lesson</span>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold mt-2 text-cream">
                    {track === 'visual' ? 'Record it, upload it, they hear it.' : 'Sign it, upload it, they watch it.'}
                  </h2>
                  <p className="text-cream/85 mt-2 max-w-md text-sm">
                    {track === 'visual'
                      ? 'Only audio is accepted here, so everything you add works in your students’ voice-only console.'
                      : 'Upload sign-language video — we ask you to confirm each one is signed, so only videos your deaf students can follow reach them.'}
                  </p>
                  <Link href="/teachers/content/upload" className="btn-kid-cream mt-5 !py-2.5 !px-5 text-sm inline-flex items-center gap-2">
                    <Upload className="w-4 h-4" /> {cfg.uploadVerb}
                  </Link>
                </div>
                <div className="relative flex justify-center">
                  <Illustration name={track === 'visual' ? 'learn-online' : 'live-class'} size={180} />
                </div>
              </div>
            </KidCard>
          </section>

          {/* Students in this track */}
          <section className="space-y-4">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-espresso inline-flex items-center gap-2">
                <Users className="w-6 h-6" /> Your {track} students
              </h2>
              <Link href="/teachers/students" className="btn-kid-ghost !py-2 !px-4 text-sm">Manage <ArrowRight className="w-4 h-4" /></Link>
            </div>
            {isLoading ? (
              <div className="h-24 rounded-2xl bg-espresso/10 animate-pulse" />
            ) : students.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {students.slice(0, 9).map((s) => (
                  <KidCard key={s.id} tone="cream" sticker className="!p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-espresso text-cream shrink-0">
                        {track === 'visual' ? <Headphones className="w-5 h-5" /> : <Captions className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-espresso truncate">{s.name}</p>
                        {s.email && <p className="text-xs text-espresso/60 truncate">{s.email}</p>}
                      </div>
                    </div>
                  </KidCard>
                ))}
              </div>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="study-group" size={140} />
                <p className="text-sm text-espresso/70 mt-3 max-w-sm">{cfg.emptyStudents}</p>
              </KidCard>
            )}
          </section>

          {/* Track lessons published */}
          <section className="space-y-4">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-espresso inline-flex items-center gap-2">
              <PlayCircle className="w-6 h-6" /> Your {cfg.contentNoun}
            </h2>
            {isLoading ? (
              <div className="h-24 rounded-2xl bg-espresso/10 animate-pulse" />
            ) : content.length ? (
              <KidCard tone="espresso" className="!p-0 overflow-hidden">
                <ul className="divide-y divide-cream/10">
                  {content.map((c) => (
                    <li key={c.id} className="flex items-center gap-4 p-4">
                      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-mustard text-espresso shrink-0">
                        {track === 'visual' ? <Headphones className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-cream truncate">{c.title}</p>
                        {c.course_title && <p className="text-xs text-cream/65 truncate">{c.course_title}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </KidCard>
            ) : (
              <KidCard tone="cream" className="flex flex-col items-center text-center py-10">
                <Illustration name="empty-courses" size={150} />
                <p className="text-sm text-espresso/70 mt-3 max-w-sm">{cfg.emptyContent}</p>
                <Link href="/teachers/content/upload" className="btn-kid-primary mt-4 !py-2 !px-4 text-sm inline-flex items-center gap-2">
                  <Upload className="w-4 h-4" /> {cfg.uploadVerb}
                </Link>
              </KidCard>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

'use client';

/**
 * Teacher dashboard router. The teaching-mode dropdown decides which dashboard
 * mounts — and only ONE mounts at a time, so switching to Visual/Hearing leaves
 * no trace of the General dashboard (and vice versa).
 */
import { useTeachingMode } from '@/contexts/TeachingModeContext';
import NormalTeacherDashboard from '@/components/dashboards/teacher/NormalTeacherDashboard';
import SpecialistTeachingDashboard from '@/components/dashboards/teacher/SpecialistTeachingDashboard';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';

export default function TeacherDashboardPage() {
  const { mode, ready } = useTeachingMode();

  // Wait until the persisted mode is known so we never flash the wrong one.
  if (!ready) {
    return (
      <div className="min-h-screen bg-cream-100">
        <AuthenticatedNavigation userRole="teacher" userName="" userEmail="" />
        <div className="flex pt-16">
          <DashboardSidebar userRole="teacher" />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="h-16 rounded-2xl bg-espresso/10 animate-pulse mb-6" />
            <div className="h-72 rounded-[2.5rem] bg-espresso/10 animate-pulse" />
          </main>
        </div>
      </div>
    );
  }

  if (mode === 'visual') return <SpecialistTeachingDashboard track="visual" />;
  if (mode === 'hearing') return <SpecialistTeachingDashboard track="hearing" />;
  return <NormalTeacherDashboard />;
}

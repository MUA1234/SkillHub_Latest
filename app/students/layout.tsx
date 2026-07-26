import StudentTrackGate from '@/components/accessibility/StudentTrackGate';

/**
 * Wraps every /students/** route in the track gate so the post-login
 * separation between normal, Visual-track and Hearing-track students is
 * enforced on every page, not just the dashboards. See StudentTrackGate.
 */
export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return <StudentTrackGate>{children}</StudentTrackGate>;
}

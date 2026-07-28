'use client';

/**
 * Visual-track "dashboard" — a blind / very-low-vision student can't use a
 * card-and-grid layout, so this route is a voice console instead of the
 * normal TrackStudentDashboard. See VisualVoiceConsole.
 */
import VisualVoiceConsole from '@/components/dashboards/track/VisualVoiceConsole';

export default function VisualStudentDashboard() {
  return <VisualVoiceConsole />;
}

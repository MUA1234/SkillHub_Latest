'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedNavigation from '@/components/ui/authenticated-navigation';
import DashboardSidebar from '@/components/ui/dashboard-sidebar';
import { StudentTrackChooser } from '@/components/accessibility/StudentTrackChooser';
import { useAdaptiveAccessibility } from '@/contexts/AdaptiveAccessibilityContext';
import { apiClient, setCurrentUser, getCurrentUser } from '@/lib/api';
import {
  Track,
  trackHome,
} from '@/lib/accessibility-tracks';
import {
  AssessmentResult,
  DisabilityType,
  InferredDisability,
  generateAdaptationProfile,
} from '@/lib/disability-assessment';

const COARSE_DISABILITY_BY_TRACK: Record<Track, DisabilityType> = {
  visual: 'visual_impairment',
  hearing: 'hearing_impairment',
};

/**
 * Logged-in re-selection of a student's support dashboard. Same direct picker
 * used at signup — no questionnaire. Replaces the old accessibility-onboarding
 * flow that this page (and Settings) previously linked to.
 */
export default function ChooseTrackPage() {
  const router = useRouter();
  const { initializeFromAssessment } = useAdaptiveAccessibility();
  const [submittingTrack, setSubmittingTrack] = useState<Track | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChoose = async (track: Track) => {
    setSubmittingTrack(track);
    setIsSubmitting(true);

    const coarse = COARSE_DISABILITY_BY_TRACK[track];
    const inferred: InferredDisability[] = [{ type: coarse, confidence: 1, severity: 'moderate' }];

    const user = getCurrentUser();
    if (user?.id) {
      const result: AssessmentResult = {
        responses: [],
        inferredDisabilities: inferred,
        adaptationProfile: generateAdaptationProfile(inferred),
        completedAt: new Date().toISOString(),
      };
      initializeFromAssessment(result, user.id);
    }

    try {
      await apiClient.saveDisabilityProfile({
        has_disability: true,
        disability_types: [coarse],
        primary_disability: coarse,
        severity_levels: { [coarse]: 'moderate' },
        onboarding_completed: true,
      });
      if (user) setCurrentUser({ ...user, accessibility_track: track });
    } catch (err) {
      console.warn('Could not save dashboard selection:', err);
    }

    router.push(trackHome(track));
  };

  const handleUseStandard = () => {
    router.push('/students/dashboard');
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <AuthenticatedNavigation userRole="student" userName="" userEmail="" />
      <DashboardSidebar userRole="student" />
      <main className="pt-16 p-4 sm:p-6 lg:p-8 min-h-screen">
        <div className="pt-6 lg:pt-0">
          <StudentTrackChooser
            onChoose={handleChoose}
            onUseStandard={handleUseStandard}
            submittingTrack={submittingTrack}
            isSubmitting={isSubmitting}
            heading="Choose your support dashboard"
            subheading="Pick the space that matches your needs. We’ll set everything up for you — you can come back and change this any time."
            standardLabel="I don’t need a specialised dashboard — use the standard one"
          />
        </div>
      </main>
    </div>
  );
}

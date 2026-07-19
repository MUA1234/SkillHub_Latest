'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  AdaptationProfile,
  InferredDisability,
  AssessmentResult,
  DisabilityType,
  getDisabilityLabel,
} from '@/lib/disability-assessment';


interface UserAccessibilityProfile {
  userId: string;
  hasCompletedAssessment: boolean;
  inferredDisabilities: InferredDisability[];
  adaptationProfile: AdaptationProfile;
  customOverrides: Partial<AdaptationProfile>;
  lastUpdated: string;
}

interface AdaptiveAccessibilityContextType {
  profile: UserAccessibilityProfile | null;
  isLoading: boolean;

  initializeFromAssessment: (result: AssessmentResult, userId: string) => void;
  loadProfile: (userId: string) => Promise<void>;
  clearProfile: () => void;

  updateOverride: <K extends keyof AdaptationProfile>(key: K, value: AdaptationProfile[K]) => void;
  resetToAutomatic: () => void;

  effectiveAdaptations: AdaptationProfile;
  hasDisability: (type: DisabilityType) => boolean;
  getDisabilitySummary: () => string[];
}

const DEFAULT_ADAPTATIONS: AdaptationProfile = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 100,
  lineHeight: 1.5,
  letterSpacing: 0,
  wordSpacing: 0,
  textColor: '#1a1a1a',
  backgroundColor: '#ffffff',
  highContrast: false,
  colorFilter: 'none',
  reducedAnimations: false,
  focusMode: false,
  simplifiedUI: false,
  chunkContent: false,
  breakReminders: false,
  breakIntervalMinutes: 25,
  readingGuide: false,
  readingRuler: false,
  textToSpeech: false,
  largeClickTargets: false,
  keyboardNavigation: false,
  voiceInput: false,
  extendedTimeouts: false,
  visualAlerts: false,
  captionsEnabled: false,
  signLanguageSupport: false,
  predictableLayout: false,
  reducedSensoryInput: false,
  clearNavigationCues: false,
};


const AdaptiveAccessibilityContext = createContext<AdaptiveAccessibilityContextType | undefined>(undefined);


function clearAccessibilityFromDOM() {
  const root = document.documentElement;
  const body = document.body;
  const contentWrapper = document.getElementById('a11y-content-wrapper');

  body.classList.remove('a11y-enabled');

  root.style.removeProperty('--a11y-font-family');
  root.style.removeProperty('--a11y-font-size');
  root.style.removeProperty('--a11y-line-height');
  root.style.removeProperty('--a11y-letter-spacing');
  root.style.removeProperty('--a11y-word-spacing');
  root.style.removeProperty('--a11y-text-color');
  root.style.removeProperty('--a11y-bg-color');
  root.style.removeProperty('--a11y-break-interval');
  root.style.removeProperty('--a11y-animation-duration');
  root.style.removeProperty('--a11y-transition-duration');

  const allA11yClasses = [
    'a11y-high-contrast', 'a11y-reduced-motion', 'a11y-focus-mode',
    'a11y-simplified-ui', 'a11y-chunked-content', 'a11y-reading-guide',
    'a11y-reading-ruler', 'a11y-large-targets', 'a11y-keyboard-nav',
    'a11y-predictable-layout', 'a11y-reduced-sensory', 'a11y-clear-nav',
    'a11y-dyslexic-font'
  ];
  body.classList.remove(...allA11yClasses);

  if (contentWrapper) {
    contentWrapper.classList.remove(
      'a11y-colorblind-protanopia', 'a11y-colorblind-deuteranopia',
      'a11y-colorblind-tritanopia', 'a11y-high-contrast'
    );
  }
}

function applyAdaptationsToDOM(adaptations: AdaptationProfile) {
  const root = document.documentElement;
  const body = document.body;
  const contentWrapper = document.getElementById('a11y-content-wrapper');

  body.classList.add('a11y-enabled');

  root.style.setProperty('--a11y-font-family', adaptations.fontFamily);
  root.style.setProperty('--a11y-font-size', `${adaptations.fontSize}%`);
  root.style.setProperty('--a11y-line-height', String(adaptations.lineHeight));
  root.style.setProperty('--a11y-letter-spacing', `${adaptations.letterSpacing}em`);
  root.style.setProperty('--a11y-word-spacing', `${adaptations.wordSpacing}em`);
  root.style.setProperty('--a11y-text-color', adaptations.textColor);
  root.style.setProperty('--a11y-bg-color', adaptations.backgroundColor);
  root.style.setProperty('--a11y-break-interval', `${adaptations.breakIntervalMinutes}`);

  const classMap: [keyof AdaptationProfile, string][] = [
    ['highContrast', 'a11y-high-contrast'],
    ['reducedAnimations', 'a11y-reduced-motion'],
    ['focusMode', 'a11y-focus-mode'],
    ['simplifiedUI', 'a11y-simplified-ui'],
    ['chunkContent', 'a11y-chunked-content'],
    ['readingGuide', 'a11y-reading-guide'],
    ['readingRuler', 'a11y-reading-ruler'],
    ['largeClickTargets', 'a11y-large-targets'],
    ['keyboardNavigation', 'a11y-keyboard-nav'],
    ['predictableLayout', 'a11y-predictable-layout'],
    ['reducedSensoryInput', 'a11y-reduced-sensory'],
    ['clearNavigationCues', 'a11y-clear-nav'],
  ];

  classMap.forEach(([key, className]) => {
    if (adaptations[key]) {
      body.classList.add(className);
    } else {
      body.classList.remove(className);
    }
  });

  const colorFilterClasses = [
    'a11y-colorblind-protanopia',
    'a11y-colorblind-deuteranopia',
    'a11y-colorblind-tritanopia',
  ];

  if (contentWrapper) {
    contentWrapper.classList.remove(...colorFilterClasses);
    if (adaptations.colorFilter && adaptations.colorFilter !== 'none') {
      contentWrapper.classList.add(`a11y-colorblind-${adaptations.colorFilter}`);
    }
  }

  if (contentWrapper) {
    if (adaptations.highContrast) {
      contentWrapper.classList.add('a11y-high-contrast');
    } else {
      contentWrapper.classList.remove('a11y-high-contrast');
    }
  }

  if (adaptations.fontFamily.includes('OpenDyslexic')) {
    body.classList.add('a11y-dyslexic-font');
  } else {
    body.classList.remove('a11y-dyslexic-font');
  }

  if (adaptations.reducedAnimations) {
    root.style.setProperty('--a11y-animation-duration', '0.01ms');
    root.style.setProperty('--a11y-transition-duration', '0.01ms');
  } else {
    root.style.removeProperty('--a11y-animation-duration');
    root.style.removeProperty('--a11y-transition-duration');
  }

  const announcement = document.getElementById('a11y-live-region');
  if (announcement) {
    announcement.textContent = 'Accessibility settings applied';
    setTimeout(() => {
      announcement.textContent = '';
    }, 1000);
  }
}


// Pushes the assessment result to POST /accessibility/disability-profile so
// it's visible server-side (teacher search-by-specialization, sponsor
// disability-breakdown analytics, content filtering) — previously this
// context only ever wrote to localStorage.
async function syncDisabilitiesToServer(disabilities: InferredDisability[]) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (!token) return;

  try {
    const sorted = [...disabilities].sort((a, b) => b.confidence - a.confidence);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/disability-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        has_disability: disabilities.length > 0,
        disability_types: disabilities.map((d) => d.type),
        primary_disability: sorted[0]?.type,
        severity_levels: Object.fromEntries(disabilities.map((d) => [d.type, d.severity])),
        onboarding_completed: true,
      }),
    });
  } catch (error) {
    console.error('Failed to sync accessibility profile to server:', error);
  }
}

interface AdaptiveAccessibilityProviderProps {
  children: ReactNode;
}

export function AdaptiveAccessibilityProvider({ children }: AdaptiveAccessibilityProviderProps) {
  const [profile, setProfile] = useState<UserAccessibilityProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const effectiveAdaptations: AdaptationProfile = profile
    ? { ...profile.adaptationProfile, ...profile.customOverrides }
    : DEFAULT_ADAPTATIONS;

  useEffect(() => {
    if (typeof window !== 'undefined' && profile !== null) {
      applyAdaptationsToDOM(effectiveAdaptations);
    }
  }, [effectiveAdaptations, profile]);

  useEffect(() => {
    const loadSavedProfile = async () => {
      try {
        const savedProfile = localStorage.getItem('a11y_profile');
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile);
          setProfile(parsed);
        }

        const currentUser = localStorage.getItem('current_user');
        if (currentUser) {
          const user = JSON.parse(currentUser);
        }
      } catch (error) {
        console.error('Failed to load accessibility profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSavedProfile();
  }, []);

  const initializeFromAssessment = useCallback((result: AssessmentResult, userId: string) => {
    const newProfile: UserAccessibilityProfile = {
      userId,
      hasCompletedAssessment: true,
      inferredDisabilities: result.inferredDisabilities,
      adaptationProfile: result.adaptationProfile,
      customOverrides: {},
      lastUpdated: result.completedAt,
    };

    setProfile(newProfile);
    localStorage.setItem('a11y_profile', JSON.stringify(newProfile));

    // Best-effort — during signup this fires before the student has logged
    // in (register() doesn't set a token), so there's often nothing to sync
    // to yet. loadProfile() picks up the localStorage copy and pushes it on
    // first authenticated load instead.
    syncDisabilitiesToServer(result.inferredDisabilities);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      const savedProfile = localStorage.getItem('a11y_profile');
      let localParsed: UserAccessibilityProfile | null = null;
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        if (parsed.userId === userId) localParsed = parsed;
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      if (token) {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/accessibility/disability-profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.profile?.has_disability) {
              // Server has a real profile — it's the source of truth.
              const severityLevels = data.profile.severity_levels || {};
              const serverDisabilities: InferredDisability[] = (data.profile.disability_types || []).map(
                (type: DisabilityType) => ({
                  type,
                  confidence: 1,
                  severity: severityLevels[type] || 'moderate',
                })
              );
              const merged: UserAccessibilityProfile = {
                userId,
                hasCompletedAssessment: true,
                inferredDisabilities: serverDisabilities,
                adaptationProfile: localParsed?.adaptationProfile || DEFAULT_ADAPTATIONS,
                customOverrides: localParsed?.customOverrides || {},
                lastUpdated: new Date().toISOString(),
              };
              setProfile(merged);
              localStorage.setItem('a11y_profile', JSON.stringify(merged));
              return;
            } else if (localParsed?.hasCompletedAssessment) {
              // Local has a completed assessment the server never received
              // (synced before the student had a token) — push it now.
              syncDisabilitiesToServer(localParsed.inferredDisabilities);
            }
          }
        } catch (error) {
          console.error('Failed to load accessibility profile from server:', error);
        }
      }

      if (localParsed) {
        setProfile(localParsed);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    localStorage.removeItem('a11y_profile');
    clearAccessibilityFromDOM();
  }, []);

  const updateOverride = useCallback(<K extends keyof AdaptationProfile>(
    key: K,
    value: AdaptationProfile[K]
  ) => {
    setProfile(prev => {
      if (!prev) return prev;

      const newOverrides = { ...prev.customOverrides, [key]: value };
      const newProfile = {
        ...prev,
        customOverrides: newOverrides,
        lastUpdated: new Date().toISOString(),
      };

      localStorage.setItem('a11y_profile', JSON.stringify(newProfile));
      return newProfile;
    });
  }, []);

  const resetToAutomatic = useCallback(() => {
    setProfile(prev => {
      if (!prev) return prev;

      const newProfile = {
        ...prev,
        customOverrides: {},
        lastUpdated: new Date().toISOString(),
      };

      localStorage.setItem('a11y_profile', JSON.stringify(newProfile));
      return newProfile;
    });
  }, []);

  const hasDisability = useCallback((type: DisabilityType): boolean => {
    return profile?.inferredDisabilities.some(d => d.type === type) ?? false;
  }, [profile]);

  const getDisabilitySummary = useCallback((): string[] => {
    if (!profile?.inferredDisabilities.length) return [];
    return profile.inferredDisabilities.map(d => getDisabilityLabel(d.type));
  }, [profile]);

  const value: AdaptiveAccessibilityContextType = {
    profile,
    isLoading,
    initializeFromAssessment,
    loadProfile,
    clearProfile,
    updateOverride,
    resetToAutomatic,
    effectiveAdaptations,
    hasDisability,
    getDisabilitySummary,
  };

  return (
    <AdaptiveAccessibilityContext.Provider value={value}>
      {}
      <div
        id="a11y-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      {children}
    </AdaptiveAccessibilityContext.Provider>
  );
}


export function useAdaptiveAccessibility() {
  const context = useContext(AdaptiveAccessibilityContext);
  if (context === undefined) {
    throw new Error('useAdaptiveAccessibility must be used within an AdaptiveAccessibilityProvider');
  }
  return context;
}


export function useTextToSpeech() {
  const { effectiveAdaptations } = useAdaptiveAccessibility();
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (!effectiveAdaptations.textToSpeech || typeof window === 'undefined') return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [effectiveAdaptations.textToSpeech]);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, []);

  return { speak, stop, speaking, enabled: effectiveAdaptations.textToSpeech };
}

export function useBreakReminders() {
  const { effectiveAdaptations } = useAdaptiveAccessibility();
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    if (!effectiveAdaptations.breakReminders) return;

    const interval = setInterval(() => {
      setShowReminder(true);
      setTimeout(() => setShowReminder(false), 30000);
    }, effectiveAdaptations.breakIntervalMinutes * 60 * 1000);

    return () => clearInterval(interval);
  }, [effectiveAdaptations.breakReminders, effectiveAdaptations.breakIntervalMinutes]);

  const dismissReminder = useCallback(() => setShowReminder(false), []);

  return { showReminder, dismissReminder, enabled: effectiveAdaptations.breakReminders };
}

export default AdaptiveAccessibilityProvider;

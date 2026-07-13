'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  AccessibilityPreferences,
  DisabilityProfile,
  ColorBlindMode,
  defaultAccessibilityPreferences,
} from '@/lib/accessibility-types';


interface AccessibilityContextType {
  preferences: AccessibilityPreferences;
  disabilityProfile: DisabilityProfile | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;

  updatePreferences: (updates: Partial<AccessibilityPreferences>) => void;
  resetPreferences: () => void;
  clearUserSettings: () => void;
  applyPreset: (presetId: string) => Promise<void>;
  savePreferencesToServer: () => Promise<void>;
  loadPreferencesFromServer: () => Promise<void>;
  setDisabilityProfile: (profile: DisabilityProfile | null) => void;
  completeOnboarding: () => void;

  toggleHighContrast: () => void;
  toggleReducedMotion: () => void;
  toggleFocusMode: () => void;
  toggleTextToSpeech: () => void;
  toggleReadingGuide: () => void;
  setColorBlindMode: (mode: ColorBlindMode) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
}


const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);


const clearPreferencesFromDOM = () => {
  const root = document.documentElement;
  const body = document.body;
  const contentWrapper = document.getElementById('a11y-content-wrapper');

  body.classList.remove('a11y-enabled');

  const cssVars = [
    '--a11y-font-size', '--a11y-letter-spacing', '--a11y-word-spacing',
    '--a11y-line-height', '--a11y-font-family', '--a11y-bg-color',
    '--a11y-text-color', '--a11y-link-color', '--a11y-highlight-color',
    '--a11y-contrast', '--a11y-brightness', '--a11y-colorblind-strength'
  ];
  cssVars.forEach(v => root.style.removeProperty(v));

  const allA11yClasses = [
    'a11y-high-contrast', 'a11y-reduced-motion', 'a11y-no-animations',
    'a11y-focus-mode', 'a11y-simplified-ui', 'a11y-large-targets',
    'a11y-reading-guide', 'a11y-reading-ruler', 'a11y-invert-colors',
    'a11y-keyboard-nav', 'a11y-dyslexic-font', 'a11y-screen-reader',
    'a11y-low-bandwidth',
  ];
  body.classList.remove(...allA11yClasses);

  const colorBlindClasses = [
    'a11y-colorblind-protanopia', 'a11y-colorblind-deuteranopia',
    'a11y-colorblind-tritanopia', 'a11y-colorblind-achromatopsia',
    'a11y-colorblind-protanomaly', 'a11y-colorblind-deuteranomaly',
    'a11y-colorblind-tritanomaly', 'a11y-high-contrast', 'a11y-invert-colors'
  ];
  body.classList.remove(...colorBlindClasses);
  if (contentWrapper) {
    contentWrapper.classList.remove(...colorBlindClasses);
  }
};

const applyPreferencesToDOM = (prefs: AccessibilityPreferences) => {
  const root = document.documentElement;
  const body = document.body;
  const contentWrapper = document.getElementById('a11y-content-wrapper');

  body.classList.add('a11y-enabled');

  root.style.setProperty('--a11y-font-size', `${prefs.font_size}%`);
  root.style.setProperty('--a11y-letter-spacing', `${prefs.letter_spacing}em`);
  root.style.setProperty('--a11y-word-spacing', `${prefs.word_spacing}em`);
  root.style.setProperty('--a11y-line-height', `${prefs.line_height}`);

  const fontFamilyMap: Record<string, string> = {
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    opendyslexic: '"OpenDyslexic", sans-serif',
    lexie_readable: '"Lexie Readable", sans-serif',
    comic_sans: '"Comic Sans MS", "Comic Sans", cursive',
    arial: 'Arial, sans-serif',
    verdana: 'Verdana, sans-serif',
    tahoma: 'Tahoma, sans-serif',
    trebuchet: '"Trebuchet MS", sans-serif',
    atkinson_hyperlegible: '"Atkinson Hyperlegible", sans-serif',
  };
  root.style.setProperty('--a11y-font-family', fontFamilyMap[prefs.font_family] || fontFamilyMap.system);

  root.style.setProperty('--a11y-bg-color', prefs.background_color);
  root.style.setProperty('--a11y-text-color', prefs.text_color);
  root.style.setProperty('--a11y-link-color', prefs.link_color);
  root.style.setProperty('--a11y-highlight-color', prefs.highlight_color);

  root.style.setProperty('--a11y-contrast', `${prefs.contrast_level}%`);
  root.style.setProperty('--a11y-brightness', `${prefs.brightness_level}%`);

  const filterClasses = ['a11y-high-contrast', 'a11y-invert-colors'];

  const bodyClassesToToggle = [
    { class: 'a11y-high-contrast', condition: prefs.high_contrast },
    { class: 'a11y-reduced-motion', condition: prefs.reduced_motion },
    { class: 'a11y-no-animations', condition: prefs.disable_animations },
    { class: 'a11y-focus-mode', condition: prefs.focus_mode },
    { class: 'a11y-simplified-ui', condition: prefs.simplified_ui },
    { class: 'a11y-large-targets', condition: prefs.large_click_targets },
    { class: 'a11y-reading-guide', condition: prefs.reading_guide },
    { class: 'a11y-reading-ruler', condition: prefs.reading_ruler },
    { class: 'a11y-invert-colors', condition: prefs.invert_colors },
    { class: 'a11y-keyboard-nav', condition: prefs.keyboard_navigation },
    { class: 'a11y-dyslexic-font', condition: prefs.font_family === 'opendyslexic' },
    { class: 'a11y-screen-reader', condition: prefs.screen_reader_optimized },
    { class: 'a11y-low-bandwidth', condition: !!prefs.low_bandwidth_mode },
  ];

  bodyClassesToToggle.forEach(({ class: className, condition }) => {
    if (condition) {
      body.classList.add(className);
    } else {
      body.classList.remove(className);
    }
  });

  if (contentWrapper) {
    filterClasses.forEach((className) => {
      const isActive = bodyClassesToToggle.find((c) => c.class === className)?.condition;
      if (isActive) {
        contentWrapper.classList.add(className);
      } else {
        contentWrapper.classList.remove(className);
      }
    });
  }

  const colorBlindClasses = [
    'a11y-colorblind-protanopia',
    'a11y-colorblind-deuteranopia',
    'a11y-colorblind-tritanopia',
    'a11y-colorblind-achromatopsia',
    'a11y-colorblind-protanomaly',
    'a11y-colorblind-deuteranomaly',
    'a11y-colorblind-tritanomaly',
  ];

  body.classList.remove(...colorBlindClasses);
  if (contentWrapper) {
    contentWrapper.classList.remove(...colorBlindClasses);
  }

  if (prefs.color_blind_mode !== 'none') {
    const colorBlindClass = `a11y-colorblind-${prefs.color_blind_mode}`;
    body.classList.add(colorBlindClass);
    if (contentWrapper) {
      contentWrapper.classList.add(colorBlindClass);
    }
    root.style.setProperty('--a11y-colorblind-strength', `${prefs.color_blind_strength}%`);
  }
};


interface AccessibilityProviderProps {
  children: ReactNode;
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(defaultAccessibilityPreferences);
  const [disabilityProfile, setDisabilityProfile] = useState<DisabilityProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasCustomPreferences, setHasCustomPreferences] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const getCurrentUserId = (): string | null => {
    try {
      const userStr = localStorage.getItem('current_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.id || null;
      }
    } catch (error) {
      console.error('Failed to get current user:', error);
    }
    return null;
  };

  const getUserStorageKey = (userId: string, key: string): string => {
    return `${key}_user_${userId}`;
  };

  useEffect(() => {
    const loadStoredPreferences = () => {
      try {
        const userId = getCurrentUserId();
        setCurrentUserId(userId);

        if (!userId) {
          setIsLoading(false);
          return;
        }

        const userPrefKey = getUserStorageKey(userId, 'skillhub-accessibility-preferences');
        const stored = localStorage.getItem(userPrefKey);

        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.userId === userId || !parsed.userId) {
            setPreferences({ ...defaultAccessibilityPreferences, ...parsed, userId });
            setHasCustomPreferences(true);
          }
        }

        const userOnboardingKey = getUserStorageKey(userId, 'skillhub-accessibility-onboarding');
        const onboardingComplete = localStorage.getItem(userOnboardingKey);
        setHasCompletedOnboarding(onboardingComplete === 'true');
      } catch (error) {
        console.error('Failed to load accessibility preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredPreferences();
  }, []);

  useEffect(() => {
    if (!isLoading && hasCustomPreferences && currentUserId) {
      applyPreferencesToDOM(preferences);

      const userPrefKey = getUserStorageKey(currentUserId, 'skillhub-accessibility-preferences');
      localStorage.setItem(userPrefKey, JSON.stringify({ ...preferences, userId: currentUserId }));
    } else if (!isLoading && !hasCustomPreferences) {
      clearPreferencesFromDOM();
    }
  }, [preferences, isLoading, hasCustomPreferences, currentUserId]);

  const updatePreferences = useCallback((updates: Partial<AccessibilityPreferences>) => {
    setHasCustomPreferences(true);
    setPreferences((prev) => ({
      ...prev,
      ...updates,
      active_preset: 'custom',
    }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(defaultAccessibilityPreferences);
    setHasCustomPreferences(false);
    clearPreferencesFromDOM();

    if (currentUserId) {
      const userPrefKey = getUserStorageKey(currentUserId, 'skillhub-accessibility-preferences');
      localStorage.removeItem(userPrefKey);
    }
  }, [currentUserId]);

  const applyPreset = useCallback(async (presetId: string) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/v1/accessibility/presets/${presetId}/apply`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setPreferences((prev) => ({
            ...prev,
            ...data.settings,
            active_preset: presetId,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to apply preset:', error);
    }
  }, []);

  const savePreferencesToServer = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      await fetch('/api/v1/accessibility/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });
    } catch (error) {
      console.error('Failed to save preferences to server:', error);
    }
  }, [preferences]);

  const loadPreferencesFromServer = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch('/api/v1/accessibility/preferences', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          setPreferences({ ...defaultAccessibilityPreferences, ...data.preferences });
        }
      }
    } catch (error) {
      console.error('Failed to load preferences from server:', error);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    setHasCompletedOnboarding(true);

    if (currentUserId) {
      const userOnboardingKey = getUserStorageKey(currentUserId, 'skillhub-accessibility-onboarding');
      localStorage.setItem(userOnboardingKey, 'true');
    }
  }, [currentUserId]);

  const clearUserSettings = useCallback(() => {
    setPreferences(defaultAccessibilityPreferences);
    setDisabilityProfile(null);
    setHasCustomPreferences(false);
    setHasCompletedOnboarding(false);
    setCurrentUserId(null);

    clearPreferencesFromDOM();

  }, []);

  const toggleHighContrast = useCallback(() => {
    updatePreferences({ high_contrast: !preferences.high_contrast });
  }, [preferences.high_contrast, updatePreferences]);

  const toggleReducedMotion = useCallback(() => {
    updatePreferences({ reduced_motion: !preferences.reduced_motion });
  }, [preferences.reduced_motion, updatePreferences]);

  const toggleFocusMode = useCallback(() => {
    updatePreferences({ focus_mode: !preferences.focus_mode });
  }, [preferences.focus_mode, updatePreferences]);

  const toggleTextToSpeech = useCallback(() => {
    updatePreferences({ text_to_speech: !preferences.text_to_speech });
  }, [preferences.text_to_speech, updatePreferences]);

  const toggleReadingGuide = useCallback(() => {
    updatePreferences({ reading_guide: !preferences.reading_guide });
  }, [preferences.reading_guide, updatePreferences]);

  const setColorBlindMode = useCallback(
    (mode: ColorBlindMode) => {
      updatePreferences({ color_blind_mode: mode });
    },
    [updatePreferences]
  );

  const setFontSize = useCallback(
    (size: number) => {
      updatePreferences({ font_size: Math.max(50, Math.min(300, size)) });
    },
    [updatePreferences]
  );

  const setFontFamily = useCallback(
    (family: string) => {
      updatePreferences({ font_family: family as any });
    },
    [updatePreferences]
  );

  const contextValue: AccessibilityContextType = {
    preferences,
    disabilityProfile,
    isLoading,
    hasCompletedOnboarding,
    updatePreferences,
    resetPreferences,
    clearUserSettings,
    applyPreset,
    savePreferencesToServer,
    loadPreferencesFromServer,
    setDisabilityProfile,
    completeOnboarding,
    toggleHighContrast,
    toggleReducedMotion,
    toggleFocusMode,
    toggleTextToSpeech,
    toggleReadingGuide,
    setColorBlindMode,
    setFontSize,
    setFontFamily,
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {children}
    </AccessibilityContext.Provider>
  );
};


export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

export default AccessibilityContext;

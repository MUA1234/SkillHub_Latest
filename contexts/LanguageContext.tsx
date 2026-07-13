'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  loading: boolean;
  supportedLanguages: SupportedLanguage[];
}

interface SupportedLanguage {
  code: string;
  name: string;
  native_name: string;
  direction: string;
  flag_emoji?: string;
  is_beta?: boolean;
}

const SHIPPED_LOCALES = ['en', 'si', 'ta'] as const;
type ShippedLocale = (typeof SHIPPED_LOCALES)[number];

function isShipped(code: string | null | undefined): code is ShippedLocale {
  return !!code && (SHIPPED_LOCALES as readonly string[]).includes(code);
}

/**
 * Resolve the user's preferred locale from `navigator.languages`, picking the
 * first one we actually translate. Falls back to English. We use `languages`
 * (plural) because users often configure a chain like ['si-LK','en-US'] —
 * stripping just `navigator.language` would lose that signal.
 */
function detectBrowserLocale(): ShippedLocale {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const base = (candidate || '').split('-')[0].toLowerCase();
    if (isShipped(base)) return base;
  }
  return 'en';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string>('en');
  const [loading, setLoading] = useState(true);
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([]);

  useEffect(() => {
    fetchSupportedLanguages();
  }, []);

  useEffect(() => {
    fetchUserLanguagePreference();
  }, []);

  const fetchSupportedLanguages = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/language/supported`);
      if (response.ok) {
        const result = await response.json();
        setSupportedLanguages(result.data.languages || []);
      }
    } catch (error) {
      console.error('Error fetching supported languages:', error);
    }
  };

  const applyLocale = (lang: ShippedLocale) => {
    setLanguageState(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  };

  const fetchUserLanguagePreference = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      if (token) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/language/preference`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          const preferredLang = result.data?.preferred_language;
          if (isShipped(preferredLang)) {
            applyLocale(preferredLang);
            localStorage.setItem('preferred_language', preferredLang);
            return;
          }
        }
      }

      const storedLang = localStorage.getItem('preferred_language');
      if (isShipped(storedLang)) {
        applyLocale(storedLang);
        return;
      }

      const detected = detectBrowserLocale();
      applyLocale(detected);
      localStorage.setItem('preferred_language', detected);
    } catch (error) {
      console.error('Error fetching language preference:', error);
      const fallback = isShipped(localStorage.getItem('preferred_language'))
        ? (localStorage.getItem('preferred_language') as ShippedLocale)
        : detectBrowserLocale();
      applyLocale(fallback);
    } finally {
      setLoading(false);
    }
  };

  const setLanguage = async (lang: string): Promise<void> => {
    try {
      const target: ShippedLocale = isShipped(lang) ? lang : 'en';

      applyLocale(target);
      localStorage.setItem('preferred_language', target);

      const langInfo = supportedLanguages.find(l => l.code === target);
      if (langInfo && typeof document !== 'undefined') {
        document.documentElement.dir = langInfo.direction;
      }

      const token = localStorage.getItem('token');

      if (token) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/language/quick-change/${target}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.error('Failed to save language preference to database');
        }
      }

      window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: target } }));
    } catch (error) {
      console.error('Error setting language:', error);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, loading, supportedLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

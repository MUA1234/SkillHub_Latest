'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

import en from '@/lib/i18n/en.json';
import si from '@/lib/i18n/si.json';
import ta from '@/lib/i18n/ta.json';

type Dict = Record<string, string>;

const DICTIONARIES: Record<string, Dict> = {
  en: en as Dict,
  si: si as Dict,
  ta: ta as Dict,
};

type TParams = Record<string, string | number>;

/**
 * Replace `{token}` placeholders in a translation template with the matching
 * value. Missing tokens are left as-is (rather than blanked) so a missing
 * translation key never produces a confusing empty span — the original
 * `{role}` shows up and is easy to spot in QA.
 */
function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const v = params[key];
      return v === null || v === undefined ? '' : String(v);
    }
    return match;
  });
}

export function useTranslation() {
  const { language } = useLanguage();
  const [, force] = useState(0);

  useEffect(() => {
    const handler = () => force((n) => n + 1);
    if (typeof window !== 'undefined') {
      window.addEventListener('languageChange', handler);
      return () => window.removeEventListener('languageChange', handler);
    }
  }, []);

  const t = useCallback(
    (key: string, paramsOrFallback?: TParams | string, maybeFallback?: string): string => {
      let params: TParams | undefined;
      let fallback: string | undefined;
      if (typeof paramsOrFallback === 'string') {
        fallback = paramsOrFallback;
      } else if (paramsOrFallback && typeof paramsOrFallback === 'object') {
        params = paramsOrFallback;
        fallback = maybeFallback;
      }

      const activeDict = DICTIONARIES[language] || DICTIONARIES.en;
      const template =
        activeDict[key] ??
        DICTIONARIES.en[key] ??
        fallback ??
        key;
      return interpolate(template, params);
    },
    [language],
  );

  return { t, language };
}

export default useTranslation;

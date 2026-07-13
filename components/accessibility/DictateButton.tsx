'use client';

import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { useTranslation } from '@/hooks/use-translation';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { cn } from '@/lib/utils';

interface DictateButtonProps {
  /** Current text in the input — the dictated text appends to this. */
  value: string;
  /** Receives `value + dictation`. */
  onChange: (next: string) => void;
  /** Override the BCP-47 lang. Defaults to the active UI locale. */
  lang?: string;
  /** Hide the button entirely when the user hasn't enabled `speech_to_text` in preferences. */
  requirePreference?: boolean;
  /** Inline icon-only style (default) vs labeled pill. */
  compact?: boolean;
  className?: string;
}

const LOCALE_TO_BCP47: Record<string, string> = {
  en: 'en-US',
  si: 'si-LK',
  ta: 'ta-LK',
};

/**
 * Mic button that dictates into a text field — Phase G2.
 *
 * Returns null when:
 *   - the browser has no Web Speech recognition API, or
 *   - `requirePreference` is true and the user hasn't toggled
 *     `accessibility_preferences.speech_to_text` on.
 *
 * Otherwise renders a mic toggle that appends finalized speech segments to
 * the parent's text value via `onChange(prev + dictation)`. Multiple dictation
 * sessions accumulate (you can stop, edit, and dictate more).
 */
export function DictateButton({
  value,
  onChange,
  lang,
  requirePreference = false,
  compact = true,
  className,
}: DictateButtonProps) {
  const { preferences } = useAccessibility();
  const { t, language } = useTranslation();
  const targetLang = lang || LOCALE_TO_BCP47[language] || 'en-US';
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { supported, listening, start, stop, error } = useSpeechToText({
    lang: targetLang,
    onFinal: (segment) => {
      const prev = valueRef.current || '';
      const sep = prev && !prev.endsWith(' ') ? ' ' : '';
      onChange(prev + sep + segment);
    },
  });

  if (!supported) return null;
  if (requirePreference && !preferences.speech_to_text) return null;

  const label = listening ? t('a11y.dictate.stop') : t('a11y.dictate.start');
  const Icon = listening ? MicOff : Mic;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      title={error || label}
      aria-label={label}
      aria-pressed={listening}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors',
        compact ? 'px-1.5 py-1.5' : 'px-2.5 py-1.5',
        listening
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 animate-pulse'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        className,
      )}
    >
      <Icon className="w-4 h-4" />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export default DictateButton;

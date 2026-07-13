'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { useTranslation } from '@/hooks/use-translation';
import {
  speak,
  stopSpeaking,
  ttsSupported,
  ensureVoicesLoaded,
  languageHasVoice,
} from '@/lib/services/ttsService';
import { cn } from '@/lib/utils';

interface ReadAloudButtonProps {
  /** Text the button reads. Either pass `text` directly or `getText` for lazily-resolved content. */
  text?: string;
  getText?: () => string;
  /** Override the BCP-47 lang. Defaults to the active UI locale (en-LK / si-LK / ta-LK). */
  lang?: string;
  /** Render a small icon-only button (inline next to a heading) vs the full pill. */
  compact?: boolean;
  className?: string;
}

const LOCALE_TO_BCP47: Record<string, string> = {
  en: 'en-US',
  si: 'si-LK',
  ta: 'ta-LK',
};

/**
 * "Read aloud" button — Phase G1.
 *
 * Hidden when the browser has no `speechSynthesis`. Disabled (with a
 * tooltip) when the active locale has no voice available — Sinhala and
 * Tamil voices are missing on a lot of desktop browsers, and showing a
 * disabled affordance is friendlier than silently no-oping.
 */
export function ReadAloudButton({ text, getText, lang, compact, className }: ReadAloudButtonProps) {
  const { preferences } = useAccessibility();
  const { t, language } = useTranslation();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [hasVoice, setHasVoice] = useState<boolean>(true);
  const [speaking, setSpeaking] = useState(false);
  const cleanupRef = useRef<() => void>(() => {});

  const targetLang = lang || LOCALE_TO_BCP47[language] || 'en-US';

  useEffect(() => {
    let cancelled = false;
    if (!ttsSupported()) {
      setSupported(false);
      return;
    }
    setSupported(true);
    ensureVoicesLoaded().then(() => {
      if (cancelled) return;
      setHasVoice(languageHasVoice(targetLang));
    });
    return () => {
      cancelled = true;
    };
  }, [targetLang]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      stopSpeaking();
    };
  }, []);

  if (supported === false) return null;

  const onClick = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const content = (text ?? getText?.() ?? '').trim();
    if (!content) return;
    setSpeaking(true);
    speak(content, {
      lang: targetLang,
      rate: preferences.tts_speed ?? 1,
      pitch: preferences.tts_pitch ?? 1,
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const label = speaking ? t('a11y.readAloud.stop') : t('a11y.readAloud.start');
  const Icon = speaking ? VolumeX : supported === null ? Loader2 : Volume2;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasVoice || supported === null}
      title={!hasVoice ? t('a11y.readAloud.noVoice') : label}
      aria-label={label}
      aria-pressed={speaking}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors',
        compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5',
        speaking
          ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        (!hasVoice || supported === null) && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', supported === null && 'animate-spin')} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export default ReadAloudButton;

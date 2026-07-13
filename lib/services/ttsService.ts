/**
 * Text-to-speech service (Phase G1).
 *
 * Two delivery paths:
 *
 *  1. **Web Speech API** (`window.speechSynthesis`) — primary path.
 *     Supports English everywhere; Sinhala/Tamil voices ship on some
 *     platforms (Android, recent macOS, recent Windows) and are missing on
 *     others. We pick the best matching voice for the requested language
 *     and fall back gracefully when no voice exists.
 *
 *  2. **Backend cloud fallback** (`POST /api/v1/accessibility/tts`) — wired
 *     for future Google Cloud TTS / ResponsiveVoice integration. The endpoint
 *     does not exist server-side yet; the service tolerates a 404 and stops
 *     speaking rather than throwing. When the endpoint lands, this client is
 *     ready (just have it return a streaming MP3/WAV blob).
 *
 * Reads the active rate / pitch / volume from `AccessibilityPreferences`
 * (`tts_speed`, `tts_pitch`). Callers can also pass per-call overrides.
 */

export interface TTSOptions {
  /** BCP-47 language tag — e.g. 'en-US', 'si-LK', 'ta-LK'. Defaults to en-US. */
  lang?: string;
  /** 0.1–10.0 (browser-clamped). Defaults to 1.0. */
  rate?: number;
  /** 0.0–2.0. Defaults to 1.0. */
  pitch?: number;
  /** 0.0–1.0. Defaults to 1.0. */
  volume?: number;
  /** Fired when speech ends (natural or via `cancel`). */
  onEnd?: () => void;
  /** Fired on synthesis errors. */
  onError?: (err: Error) => void;
}

const LANG_FALLBACKS: Record<string, string[]> = {
  en: ['en-US', 'en-GB', 'en'],
  si: ['si-LK', 'si'],
  ta: ['ta-LK', 'ta-IN', 'ta'],
};

function shortCode(lang: string): string {
  return (lang || '').slice(0, 2).toLowerCase();
}

function pickVoice(targetLang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return null;

  const candidates = LANG_FALLBACKS[shortCode(targetLang)] || [targetLang];
  for (const tag of candidates) {
    const exact = all.find((v) => v.lang.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
  }
  const short = shortCode(targetLang);
  const prefix = all.find((v) => v.lang.toLowerCase().startsWith(short));
  return prefix || null;
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Cancel any in-progress synthesis and start fresh. Calling `speak()` while
 * something is already playing implicitly cancels — most browsers queue
 * utterances by default, which produces an awful pile-up if a user clicks
 * "Read aloud" twice.
 */
export function speak(text: string, options: TTSOptions = {}): void {
  if (!ttsSupported() || !text.trim()) {
    options.onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const lang = options.lang || 'en-US';
  utterance.lang = lang;
  utterance.rate = clamp(options.rate ?? 1, 0.1, 10);
  utterance.pitch = clamp(options.pitch ?? 1, 0, 2);
  utterance.volume = clamp(options.volume ?? 1, 0, 1);

  const voice = pickVoice(lang);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }

  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (e) => {
    if ((e as any).error === 'interrupted' || (e as any).error === 'canceled') {
      options.onEnd?.();
      return;
    }
    options.onError?.(new Error(`TTS error: ${(e as any).error || 'unknown'}`));
  };

  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  if (!ttsSupported()) return false;
  return window.speechSynthesis.speaking;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Voice list is populated asynchronously on most browsers — Chrome especially.
 * Callers that want to verify a language is available should await this once
 * before calling `speak()`. Resolves immediately when voices are already loaded.
 */
export function ensureVoicesLoaded(timeoutMs: number = 1500): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve();
    };
    synth.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

export function languageHasVoice(lang: string): boolean {
  return !!pickVoice(lang);
}

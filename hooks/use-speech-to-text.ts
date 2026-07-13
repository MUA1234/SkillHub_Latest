/**
 * Speech-to-text hook (Phase G2).
 *
 * Wraps the browser's Web Speech API recognition (`SpeechRecognition` /
 * `webkitSpeechRecognition`) with a React-friendly start/stop surface.
 * Returns interim + final transcripts so callers can render a live
 * "you said: …" preview without waiting for the user to pause.
 *
 * The platform's existing `lib/services/captionService.ts` does similar
 * work for live-session captioning (one-shot per teacher), but its API is
 * imperative (start/stop on a class instance) and tightly coupled to
 * meeting captions. This hook is the chat / forum / support-ticket variant
 * — short bursts of input, the transcript replaces or appends to a text
 * field, and the caller decides what to do with it.
 *
 * Sinhala / Tamil recognition support depends on the browser. Chrome on
 * Android has decent Sinhala/Tamil recognition; desktop browsers usually
 * don't. The hook surfaces this via `supported` so the mic button can hide
 * itself rather than silently failing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSpeechToTextOptions {
  /** BCP-47 lang tag — e.g. 'en-US', 'si-LK', 'ta-LK'. Defaults to 'en-US'. */
  lang?: string;
  /** Stop after the user pauses (default false → continuous dictation). */
  oneShot?: boolean;
  /** Fired with each finalized segment. The hook also exposes the running transcript. */
  onFinal?: (text: string) => void;
}

export interface UseSpeechToTextReturn {
  supported: boolean;
  listening: boolean;
  /** The full transcript so far — finalized segments concatenated. */
  transcript: string;
  /** The last interim (non-finalized) chunk, useful for a live preview. */
  interim: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

function getRecognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const { lang = 'en-US', oneShot = false, onFinal } = options;

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const rec = new Ctor();
    rec.continuous = !oneShot;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: any) => {
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          setTranscript((prev) => (prev ? prev + ' ' : '') + text.trim());
          onFinalRef.current?.(text.trim());
        } else {
          interimChunk += text;
        }
      }
      setInterim(interimChunk);
    };

    rec.onerror = (event: any) => {
      const err = event?.error || 'unknown';
      if (err !== 'no-speech' && err !== 'aborted') {
        setError(`Speech recognition error: ${err}`);
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
      }
      recognitionRef.current = null;
    };
  }, [lang, oneShot]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || listening) return;
    setError(null);
    setInterim('');
    try {
      rec.start();
      setListening(true);
    } catch (err: any) {
      setError(err?.message || 'Could not start speech recognition.');
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, start, stop, reset, error };
}

export default useSpeechToText;

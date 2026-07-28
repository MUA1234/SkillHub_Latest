'use client';

/**
 * Visual-track voice console — the entire "dashboard" for a blind / very-low-
 * vision student.
 *
 * A sighted student's card-and-grid dashboard is useless to someone who can't
 * see it, so the Visual track doesn't render one. Instead the student talks to
 * the platform:
 *
 *   1. Hold the SPACE BAR (or the big on-screen button) and speak.
 *   2. Let go — the speech is transcribed and turned into an intent.
 *   3. The assistant replies out loud (Web Speech TTS) and, for a search,
 *      reads the matching lessons one preview at a time.
 *   4. "Hold space and say Play" plays the lesson's audio.
 *
 * "Hey SkillHub" is accepted as an optional wake prefix. Everything also works
 * by keyboard (Space talk, Enter play/pause, arrows next/prev, R repeat, H help)
 * and by on-screen buttons, so a low-vision student, a helper, or a browser
 * without SpeechRecognition (Firefox/Safari) can still drive it. Spoken replies
 * are mirrored as large high-contrast captions with an aria-live region.
 *
 * Data comes from the same walled, presigned library the Visual track already
 * uses (apiClient.getAccessibilityLibrary) — see accessibility_student.py.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Play, Pause, SkipForward, SkipBack, RotateCcw, HelpCircle, LogOut, Volume2 } from 'lucide-react';
import { apiClient, getCurrentUser, isAuthenticated } from '@/lib/api';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { speak, stopSpeaking, ensureVoicesLoaded, ttsSupported } from '@/lib/services/ttsService';

interface LibItem {
  id: string;
  title: string;
  description?: string | null;
  subject_name?: string | null;
  teacher_name?: string | null;
  duration?: string | null;
  media: {
    content_url?: string | null;
    audio_url?: string | null;
    audio_description_url?: string | null;
  };
}

// Pull the best playable audio source for an item, in priority order.
function audioSrc(item: LibItem | undefined): string | null {
  if (!item) return null;
  return item.media?.audio_url || item.media?.audio_description_url || item.media?.content_url || null;
}

export default function VisualVoiceConsole() {
  const router = useRouter();

  const [activated, setActivated] = useState(false);
  const [assistantText, setAssistantText] = useState('');
  const [heardText, setHeardText] = useState('');
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | 'playing'>('idle');
  const [results, setResults] = useState<LibItem[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [textFallback, setTextFallback] = useState('');

  // Refs so async callbacks and key handlers read the latest values.
  const resultsRef = useRef<LibItem[]>([]);
  const indexRef = useRef(0);
  const captureBufferRef = useRef('');
  const interimRef = useRef('');
  const capturingRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const activatedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { activatedRef.current = activated; }, [activated]);

  const { supported: sttSupported, listening, interim, start, stop, reset } = useSpeechToText({
    oneShot: false,
    onFinal: (seg) => {
      if (capturingRef.current) {
        captureBufferRef.current = (captureBufferRef.current + ' ' + seg).trim();
      }
    },
  });
  useEffect(() => { interimRef.current = interim; }, [interim]);

  const currentUser = getCurrentUser();
  const firstName = currentUser?.profile?.first_name || 'friend';

  // ---- speaking -----------------------------------------------------------
  const say = useCallback((text: string, onDone?: () => void) => {
    setAssistantText(text);
    setStatus('speaking');
    if (!ttsSupported()) {
      setStatus('idle');
      onDone?.();
      return;
    }
    speak(text, {
      rate: 1,
      onEnd: () => {
        setStatus((s) => (s === 'speaking' ? 'idle' : s));
        onDone?.();
      },
      onError: () => {
        setStatus('idle');
        onDone?.();
      },
    });
  }, []);

  // ---- playback -----------------------------------------------------------
  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) { try { a.pause(); } catch { /* noop */ } }
    setStatus((s) => (s === 'playing' ? 'idle' : s));
  }, []);

  const previewLine = useCallback((item: LibItem, i: number, n: number) => {
    const parts = [
      `Number ${i + 1} of ${n}.`,
      item.title ? `${item.title}.` : '',
      item.subject_name ? `Subject: ${item.subject_name}.` : '',
      item.teacher_name ? `By ${item.teacher_name}.` : '',
    ];
    return parts.filter(Boolean).join(' ');
  }, []);

  const announceCurrent = useCallback((withHint = true) => {
    const list = resultsRef.current;
    const i = indexRef.current;
    if (!list.length) { say("You don't have any lessons open right now. Hold the space bar and tell me what you'd like to learn."); return; }
    const item = list[i];
    const hint = withHint ? ' Hold the space bar and say Play to listen, or say Next for the next one.' : '';
    say(previewLine(item, i, list.length) + hint);
  }, [say, previewLine]);

  const playCurrent = useCallback(() => {
    const list = resultsRef.current;
    const i = indexRef.current;
    if (!list.length) { say("There's nothing to play yet. Hold the space bar and tell me a topic to learn."); return; }
    const item = list[i];
    const src = audioSrc(item);
    if (!src) { say(`"${item.title}" doesn't have audio yet. Say Next to try another lesson.`); return; }
    const a = audioRef.current;
    if (!a) return;
    stopSpeaking();
    setAssistantText(`▶ Playing: ${item.title}`);
    setStatus('playing');
    a.src = src;
    a.play().catch(() => {
      say(`I couldn't play "${item.title}". Say Next to try another lesson.`);
    });
  }, [say]);

  const move = useCallback((delta: number) => {
    const list = resultsRef.current;
    if (!list.length) { say('Hold the space bar and tell me what you want to learn first.'); return; }
    const next = indexRef.current + delta;
    if (next < 0) { say('You are already on the first lesson. Say Play to listen, or Next to move on.'); return; }
    if (next >= list.length) { say('That was the last lesson. Say a new topic to search again, or Previous to go back.'); return; }
    indexRef.current = next;
    setIndex(next);
    announceCurrent(true);
  }, [say, announceCurrent]);

  // ---- search -------------------------------------------------------------
  const doSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) { say("I didn't catch a topic. Hold the space bar and say, for example: I want to learn about plants."); return; }
    setBusy(true);
    setStatus('thinking');
    setAssistantText(`Searching for "${q}"…`);
    try {
      const resp = await apiClient.getAccessibilityLibrary({ search: q, limit: 20 });
      const items: LibItem[] = resp?.data?.items || [];
      resultsRef.current = items;
      indexRef.current = 0;
      setResults(items);
      setIndex(0);
      if (!items.length) {
        say(`I couldn't find any lessons about ${q}. Try another topic — hold the space bar and tell me what you'd like to learn.`);
        return;
      }
      const first = items[0];
      say(
        `Okay. Here are ${items.length} ${items.length === 1 ? 'lesson' : 'lessons'} about ${q}. ` +
        `I'll read each one, and you tell me when to play it. ` +
        previewLine(first, 0, items.length) +
        ` When you're ready, hold the space bar and say Play.`,
      );
    } catch (e: any) {
      say("Something went wrong while searching. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [say, previewLine]);

  // ---- help / home --------------------------------------------------------
  const sayHelp = useCallback(() => {
    say(
      'Here is what you can do. Hold the space bar and speak, then let go. ' +
      'Say "I want to learn" and a topic to find lessons. ' +
      'Say Play to listen, Next or Previous to move between lessons, Repeat to hear a lesson again, and Stop to pause. ' +
      'You can also say Find a teacher, or My bookings. Say Help any time to hear this again.',
    );
  }, [say]);

  const goToSpecialist = useCallback(() => {
    say('Opening the page to find a specialist teacher for you.', () => router.push('/students/visual/find-specialist'));
  }, [say, router]);

  // ---- intent parsing -----------------------------------------------------
  const handleCommand = useCallback((raw: string) => {
    let text = (raw || '').toLowerCase().trim();
    if (!text) { say("I didn't catch that. Hold the space bar and speak, then let go."); return; }
    setHeardText(raw);
    // Strip optional wake word.
    text = text.replace(/^(hey|ok|okay|hi|hello)\s+skill\s?hub[,!.\s]*/i, '').trim();
    text = text.replace(/^skill\s?hub[,!.\s]*/i, '').trim();
    if (!text) { say('I\'m listening. Tell me what you\'d like to learn.'); return; }

    const has = (...words: string[]) => words.some((w) => new RegExp(`(^|\\b)${w}(\\b|$)`, 'i').test(text));

    // Playback controls first (short, unambiguous).
    if (has('stop', 'pause', 'quiet', 'shut up', 'be quiet', 'silence')) {
      stopSpeaking(); stopAudio(); setStatus('idle'); setAssistantText('Paused.'); return;
    }
    if (has('play', 'listen', 'resume', 'start')) { playCurrent(); return; }
    if (has('next', 'skip', 'forward')) { move(1); return; }
    if (has('previous', 'back', 'go back', 'last one', 'before')) { move(-1); return; }
    if (has('repeat', 'again', 'say again', 'what was that')) { announceCurrent(false); return; }
    if (has('help', 'what can i say', 'what can i do', 'commands', 'options')) { sayHelp(); return; }
    if (has('find a teacher', 'specialist', 'find teacher', 'a teacher')) { goToSpecialist(); return; }
    if (has('how many', 'results')) {
      const n = resultsRef.current.length;
      say(n ? `You have ${n} ${n === 1 ? 'lesson' : 'lessons'} open. You're on number ${indexRef.current + 1}.` : 'No lessons are open. Tell me a topic to search.');
      return;
    }
    if (has('where am i', 'menu', 'home', 'main menu')) {
      say('You are in your voice learning space. Hold the space bar and tell me what to learn, or say Help.');
      return;
    }

    // Search intents — pull the topic out of common phrasings.
    const m = text.match(
      /(?:i (?:want|would like|wanna|wish) to learn(?: about)?|teach me(?: about)?|learn(?: about)?|find(?: me)?(?: lessons?(?: about| on)?)?|search(?: for)?|show me|lessons?(?: about| on)|i want|about)\s+(.*)$/i,
    );
    if (m && m[1] && m[1].trim().length > 1) { doSearch(m[1].trim()); return; }

    // Fallback: treat the whole utterance as a topic if it looks like one.
    if (text.split(/\s+/).length >= 1 && text.length >= 3) { doSearch(text); return; }

    say("I didn't quite get that. Say Help to hear what you can do, or tell me a topic to learn.");
  }, [say, playCurrent, move, announceCurrent, sayHelp, goToSpecialist, doSearch, stopAudio]);

  // ---- push-to-talk -------------------------------------------------------
  const startCapture = useCallback(() => {
    if (!activatedRef.current || capturingRef.current) return;
    if (!sttSupported) return;
    stopSpeaking();
    const a = audioRef.current;
    if (a && !a.paused) { try { a.pause(); } catch { /* noop */ } }
    captureBufferRef.current = '';
    interimRef.current = '';
    reset();
    capturingRef.current = true;
    setStatus('listening');
    setHeardText('');
    start();
  }, [sttSupported, reset, start]);

  const endCapture = useCallback(() => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    stop();
    // Give the recognizer a beat to flush the final segment, then act on
    // whatever we captured (falling back to the last interim guess).
    window.setTimeout(() => {
      const text = (captureBufferRef.current || interimRef.current || '').trim();
      if (text) handleCommand(text);
      else say("I didn't hear anything. Hold the space bar, speak, then let go.");
    }, 350);
  }, [stop, handleCommand, say]);

  // Keyboard: space = push to talk, and single-key shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activatedRef.current) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (typing) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceHeldRef.current) { spaceHeldRef.current = true; startCapture(); }
        return;
      }
      if (e.repeat) return;
      switch (e.key.toLowerCase()) {
        case 'enter': e.preventDefault(); status === 'playing' ? stopAudio() : playCurrent(); break;
        case 'arrowright': e.preventDefault(); move(1); break;
        case 'arrowleft': e.preventDefault(); move(-1); break;
        case 'r': announceCurrent(false); break;
        case 'h': sayHelp(); break;
        case 's': stopSpeaking(); stopAudio(); setStatus('idle'); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeldRef.current) {
        spaceHeldRef.current = false;
        endCapture();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startCapture, endCapture, playCurrent, stopAudio, move, announceCurrent, sayHelp, status]);

  // Guard: this console is Visual-track only.
  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/auth'); return; }
    const cu = getCurrentUser() as any;
    if (cu?.role !== 'student') { router.replace('/auth'); return; }
    const track = cu?.accessibility_track;
    if (track && track !== 'visual') { router.replace('/students/hearing/dashboard'); return; }
    if (!track) { router.replace('/students/dashboard'); return; }
  }, [router]);

  // Cleanup on unmount.
  useEffect(() => () => { stopSpeaking(); const a = audioRef.current; if (a) { try { a.pause(); } catch { /* noop */ } } }, []);

  const activate = useCallback(async () => {
    if (activatedRef.current) return;
    setActivated(true);
    activatedRef.current = true;
    await ensureVoicesLoaded();
    say(
      `Welcome to SkillHub, ${firstName}. This is your voice space — you don't need to see anything. ` +
      `To talk to me, hold down the space bar, say what you want, then let go. ` +
      `For example, hold the space bar and say: I want to learn about the solar system. ` +
      `Let go when you're done, and I'll find lessons for you. Say Help any time to hear everything you can do.`,
    );
  }, [firstName, say]);

  // ---- activation gate ----------------------------------------------------
  if (!activated) {
    return (
      <main
        onClick={activate}
        className="min-h-screen bg-forest text-cream flex flex-col items-center justify-center p-6 text-center cursor-pointer"
      >
        <h1 className="sr-only">SkillHub voice learning space for visually impaired students</h1>
        <div className="max-w-xl">
          <div className="mx-auto mb-8 grid h-28 w-28 place-items-center rounded-full bg-cream/15 border-2 border-cream/40">
            <Volume2 className="h-14 w-14" aria-hidden />
          </div>
          <p className="font-display text-3xl sm:text-4xl font-bold leading-tight">Your voice learning space</p>
          <p className="text-cream/80 mt-4 text-lg">
            Press the button or tap anywhere to begin. Then hold the <strong>space bar</strong>, say what you want to
            learn, and let go.
          </p>
          <button
            onClick={activate}
            className="mt-10 inline-flex items-center gap-3 rounded-full bg-cream text-espresso font-bold text-xl px-10 py-5 shadow-sticker hover:-translate-y-0.5 transition-transform focus:outline-none focus:ring-4 focus:ring-cream/50"
            autoFocus
          >
            <Mic className="h-7 w-7" aria-hidden /> Start talking
          </button>
          {!sttSupported && (
            <p className="mt-6 text-cream/70 text-sm" role="note">
              Your browser can&apos;t hear the microphone. You can still type your request and use the buttons — for the
              full voice experience, open SkillHub in Google Chrome or Microsoft Edge.
            </p>
          )}
        </div>
      </main>
    );
  }

  const listeningNow = listening || status === 'listening';
  const current = results[index];

  return (
    <main className="min-h-screen bg-forest text-cream flex flex-col">
      <h1 className="sr-only">SkillHub voice learning space</h1>

      {/* Top bar: exit only — no visual clutter. */}
      <header className="flex items-center justify-between px-5 py-4">
        <span className="inline-flex items-center gap-2 font-display font-bold text-lg">
          <Volume2 className="h-5 w-5" aria-hidden /> SkillHub Voice
        </span>
        <button
          onClick={() => { stopSpeaking(); router.push('/students/settings/accessibility'); }}
          className="text-cream/70 hover:text-cream text-sm font-semibold underline underline-offset-2"
        >
          Settings
        </button>
      </header>

      {/* Live captions of what the assistant said + what was heard. */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div
          aria-live="assertive"
          aria-atomic="true"
          className="max-w-3xl min-h-[7rem] text-2xl sm:text-3xl font-semibold leading-snug"
        >
          {assistantText || 'Hold the space bar and tell me what you want to learn.'}
        </div>

        {heardText && (
          <p className="text-cream/70 text-lg max-w-2xl" aria-live="polite">
            You said: “{heardText}”
          </p>
        )}
        {listeningNow && interim && (
          <p className="text-mustard text-xl max-w-2xl">Listening: {interim}…</p>
        )}

        {/* Status pill */}
        <div className="text-cream/80 text-sm font-bold uppercase tracking-widest">
          {busy ? 'Thinking…' : listeningNow ? '● Listening — let go to send' : status === 'playing' ? '▶ Playing' : status === 'speaking' ? 'Speaking…' : 'Ready'}
        </div>

        {/* Big push-to-talk button (pointer + keyboard). */}
        <button
          onPointerDown={(e) => { e.preventDefault(); startCapture(); }}
          onPointerUp={(e) => { e.preventDefault(); endCapture(); }}
          onPointerLeave={() => { if (capturingRef.current) endCapture(); }}
          disabled={!sttSupported}
          aria-label="Hold to talk"
          className={`grid place-items-center h-40 w-40 rounded-full border-4 transition-all select-none touch-none ${
            listeningNow
              ? 'bg-mustard text-espresso border-cream scale-105'
              : 'bg-cream/10 text-cream border-cream/40 hover:bg-cream/20'
          } disabled:opacity-40`}
        >
          <Mic className="h-16 w-16" aria-hidden />
        </button>
        <p className="text-cream/70">Hold the <strong>space bar</strong> or this button, speak, then let go.</p>

        {/* On-screen command buttons — mirror the voice commands. */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <ConsoleBtn onClick={() => (status === 'playing' ? stopAudio() : playCurrent())} icon={status === 'playing' ? <Pause /> : <Play />} label={status === 'playing' ? 'Pause' : 'Play'} />
          <ConsoleBtn onClick={() => move(-1)} icon={<SkipBack />} label="Previous" />
          <ConsoleBtn onClick={() => move(1)} icon={<SkipForward />} label="Next" />
          <ConsoleBtn onClick={() => announceCurrent(false)} icon={<RotateCcw />} label="Repeat" />
          <ConsoleBtn onClick={sayHelp} icon={<HelpCircle />} label="Help" />
        </div>

        {/* Text fallback for browsers with no speech recognition. */}
        {!sttSupported && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (textFallback.trim()) { handleCommand(textFallback.trim()); setTextFallback(''); } }}
            className="w-full max-w-lg flex gap-2 pt-2"
          >
            <input
              value={textFallback}
              onChange={(e) => setTextFallback(e.target.value)}
              placeholder="Type what you want to learn…"
              className="flex-1 rounded-xl px-4 py-3 text-espresso text-lg"
              aria-label="Type a command"
            />
            <button type="submit" className="rounded-xl bg-cream text-espresso font-bold px-5">Go</button>
          </form>
        )}
      </section>

      {/* Current-lesson strip (visible for low-vision / helpers). */}
      {current && (
        <footer className="bg-espresso/40 px-6 py-4 text-center" aria-hidden>
          <p className="text-cream/60 text-xs uppercase tracking-widest">Lesson {index + 1} of {results.length}</p>
          <p className="text-cream text-lg font-semibold truncate">{current.title}</p>
          <p className="text-cream/70 text-sm truncate">{[current.subject_name, current.teacher_name].filter(Boolean).join(' · ')}</p>
        </footer>
      )}

      <audio
        ref={audioRef}
        onEnded={() => { setStatus('idle'); say('That is the end of this lesson. Say Next for the next one, Repeat to hear it again, or a new topic to search.'); }}
        onError={() => { if (status === 'playing') say('I could not play that lesson. Say Next to try another.'); }}
        hidden
      />
    </main>
  );
}

function ConsoleBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-cream/10 hover:bg-cream/20 border-2 border-cream/30 px-5 py-3 font-bold text-cream focus:outline-none focus:ring-2 focus:ring-cream/60"
    >
      <span className="[&_svg]:h-5 [&_svg]:w-5" aria-hidden>{icon}</span> {label}
    </button>
  );
}

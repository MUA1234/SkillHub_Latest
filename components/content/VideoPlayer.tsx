'use client';

/**
 * Phase I1 — Accessible video player.
 *
 * Builds on the native <video> element rather than a heavy third-party
 * player so screen readers, low-bandwidth contexts, and keyboard users all
 * inherit the platform behavior they already know.
 *
 * Accessibility features wired here:
 *   - WebVTT captions (track[kind=captions]) toggled via the C key + button
 *   - Transcript panel (loads transcript_url, can be navigated by keyboard,
 *     read by screen readers)
 *   - Playback speed selector (0.5 / 0.75 / 1 / 1.25 / 1.5 / 2)
 *   - Audio-only mode (hides the picture, keeps controls — used when video
 *     would be a distraction or unavailable bandwidth-wise)
 *   - Audio descriptions: when audio_description_url is set, swaps the main
 *     audio for the described track (described track is rendered as a
 *     parallel <audio> element so video frames keep playing in sync)
 *   - Sign-language picture-in-picture overlay when sign_language_video_url
 *     is set
 *   - Full keyboard control: Space play/pause, ←/→ seek 5s, ↑/↓ volume,
 *     M mute, F fullscreen, C captions, T transcript
 *
 * Progress callback (Phase I2):
 *   - `onProgress` fires every 15 seconds while playing AND on unmount AND
 *     when the tab is hidden (visibilitychange + pagehide) so we don't lose
 *     the final reading on a navigation away.
 *   - `onComplete` fires once when the watched fraction crosses
 *     `completionThreshold` (default 0.9 = 90 %).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Subtitles,
  FileText,
  Headphones,
  Hand,
  Gauge,
  X,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  captionUrl?: string;
  captionLang?: string;
  transcriptUrl?: string;
  audioDescriptionUrl?: string;
  signLanguageVideoUrl?: string;
  /** Called every 15s while playing and on unmount/hide.
   *  positionSeconds is the current time; durationSeconds is total. */
  onProgress?: (positionSeconds: number, durationSeconds: number) => void;
  /** Fired once when watched fraction first crosses completionThreshold. */
  onComplete?: () => void;
  /** Default 0.9 — 90 % of duration */
  completionThreshold?: number;
  /** Hide the picture (audio-only). Can also be toggled via the button. */
  initialAudioOnly?: boolean;
  className?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PROGRESS_INTERVAL_MS = 15_000;

function format(t: number): string {
  if (!isFinite(t) || t < 0) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoPlayer({
  src,
  poster,
  title,
  captionUrl,
  captionLang = 'en',
  transcriptUrl,
  audioDescriptionUrl,
  signLanguageVideoUrl,
  onProgress,
  onComplete,
  completionThreshold = 0.9,
  initialAudioOnly = false,
  className = '',
}: VideoPlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const slvRef = useRef<HTMLVideoElement>(null);
  const adRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [audioOnly, setAudioOnly] = useState(initialAudioOnly);
  const [audioDescOn, setAudioDescOn] = useState(false);
  const [signLangOn, setSignLangOn] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);

  const completedRef = useRef(false);
  const lastReportedRef = useRef(0);


  const syncSecondaryTracks = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (slvRef.current && Math.abs(slvRef.current.currentTime - v.currentTime) > 0.4) {
      slvRef.current.currentTime = v.currentTime;
    }
    if (adRef.current && Math.abs(adRef.current.currentTime - v.currentTime) > 0.4) {
      adRef.current.currentTime = v.currentTime;
    }
  }, []);


  const reportProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !onProgress) return;
    const dur = v.duration || duration || 0;
    const pos = v.currentTime || 0;
    if (Math.abs(pos - lastReportedRef.current) < 1 && pos > 0) return;
    lastReportedRef.current = pos;
    onProgress(pos, dur);
    if (
      !completedRef.current &&
      dur > 0 &&
      pos / dur >= completionThreshold
    ) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [onProgress, onComplete, completionThreshold, duration]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(reportProgress, PROGRESS_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, reportProgress]);

  useEffect(() => {
    const flush = () => reportProgress();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [reportProgress]);


  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(v.currentTime);
      syncSecondaryTracks();
    };
    const onMeta = () => setDuration(v.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      reportProgress();
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('ended', onEnd);
    };
  }, [syncSecondaryTracks, reportProgress]);


  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (slvRef.current) slvRef.current.playbackRate = speed;
    if (adRef.current) adRef.current.playbackRate = speed;
  }, [speed]);


  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted || audioDescOn;
    v.volume = volume;
    if (adRef.current) {
      adRef.current.muted = !audioDescOn || muted;
      adRef.current.volume = volume;
    }
    if (slvRef.current) slvRef.current.muted = true;
  }, [muted, volume, audioDescOn]);


  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles') {
        tracks[i].mode = captionsOn ? 'showing' : 'hidden';
      }
    }
  }, [captionsOn, captionUrl]);


  useEffect(() => {
    if (!transcriptOpen || transcriptText || !transcriptUrl) return;
    let cancelled = false;
    setTranscriptLoading(true);
    fetch(transcriptUrl)
      .then(r => r.text())
      .then(text => {
        if (!cancelled) setTranscriptText(text);
      })
      .catch(() => {
        if (!cancelled) setTranscriptText('');
      })
      .finally(() => {
        if (!cancelled) setTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transcriptOpen, transcriptUrl, transcriptText]);


  useEffect(() => {
    if (slvRef.current) {
      if (playing && signLangOn) slvRef.current.play().catch(() => {});
      else slvRef.current.pause();
    }
    if (adRef.current) {
      if (playing && audioDescOn) adRef.current.play().catch(() => {});
      else adRef.current.pause();
    }
  }, [playing, signLangOn, audioDescOn]);


  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);


  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const v = videoRef.current;
      if (!v) return;
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (v.paused) v.play();
          else v.pause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setMuted(m => !m);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          if (captionUrl) {
            e.preventDefault();
            setCaptionsOn(o => !o);
          }
          break;
        case 't':
        case 'T':
          if (transcriptUrl) {
            e.preventDefault();
            setTranscriptOpen(o => !o);
          }
          break;
      }
    },
    [volume, captionUrl, transcriptUrl, toggleFullscreen],
  );

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const next = (parseFloat(e.target.value) / 100) * duration;
    v.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const progressPct = useMemo(() => {
    if (!duration) return 0;
    return Math.min(100, (currentTime / duration) * 100);
  }, [currentTime, duration]);


  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-lg overflow-hidden focus:outline-none ${className}`}
      tabIndex={0}
      role="region"
      aria-label={title || t('content.player.label', 'Video player')}
      onKeyDown={onKeyDown}
    >
      {}
      <div
        className={`relative ${audioOnly ? 'h-32 flex items-center justify-center bg-gradient-to-r from-blue-900 to-purple-900' : 'aspect-video'}`}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className={`w-full h-full ${audioOnly ? 'invisible absolute' : ''}`}
          playsInline
          preload="metadata"
          aria-label={title}
        >
          {captionUrl && (
            <track
              kind="captions"
              src={captionUrl}
              srcLang={captionLang}
              label={t('content.player.captions', 'Captions')}
              default={false}
            />
          )}
        </video>

        {audioOnly && (
          <div className="text-white text-center">
            <Headphones className="h-12 w-12 mx-auto mb-2" aria-hidden />
            <p className="text-sm">{t('content.player.audioOnly', 'Audio-only mode')}</p>
          </div>
        )}

        {}
        {signLanguageVideoUrl && signLangOn && (
          <video
            ref={slvRef}
            src={signLanguageVideoUrl}
            className="absolute bottom-4 right-4 w-32 sm:w-40 md:w-48 rounded-md border-2 border-white shadow-lg bg-black"
            muted
            playsInline
            preload="metadata"
            aria-label={t('content.player.signLanguage', 'Sign language interpreter')}
          />
        )}

        {}
        {audioDescriptionUrl && (
          <audio
            ref={adRef}
            src={audioDescriptionUrl}
            preload="metadata"
          />
        )}
      </div>

      {}
      <div className="bg-gray-900 text-white px-3 py-2">
        {}
        <div className="flex items-center gap-2 text-xs mb-1">
          <span aria-live="off">{format(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progressPct}
            onChange={onSeek}
            className="flex-1 accent-blue-500"
            aria-label={t('content.player.seek', 'Seek')}
          />
          <span>{format(duration)}</span>
        </div>

        {}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) v.play();
              else v.pause();
            }}
            className="p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label={playing ? t('content.player.pause', 'Pause') : t('content.player.play', 'Play')}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => setMuted(m => !m)}
            className="p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label={muted ? t('content.player.unmute', 'Unmute') : t('content.player.mute', 'Mute')}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-blue-500"
            aria-label={t('content.player.volume', 'Volume')}
          />

          {captionUrl && (
            <button
              type="button"
              onClick={() => setCaptionsOn(o => !o)}
              className={`p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 ${captionsOn ? 'bg-blue-700' : ''}`}
              aria-label={t('content.player.toggleCaptions', 'Toggle captions')}
              aria-pressed={captionsOn}
              title={t('content.player.toggleCaptions', 'Toggle captions')}
            >
              <Subtitles className="h-4 w-4" />
            </button>
          )}

          {transcriptUrl && (
            <button
              type="button"
              onClick={() => setTranscriptOpen(o => !o)}
              className={`p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 ${transcriptOpen ? 'bg-blue-700' : ''}`}
              aria-label={t('content.player.toggleTranscript', 'Toggle transcript')}
              aria-pressed={transcriptOpen}
              title={t('content.player.toggleTranscript', 'Toggle transcript')}
            >
              <FileText className="h-4 w-4" />
            </button>
          )}

          {audioDescriptionUrl && (
            <button
              type="button"
              onClick={() => setAudioDescOn(o => !o)}
              className={`p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 ${audioDescOn ? 'bg-blue-700' : ''}`}
              aria-label={t('content.player.toggleAudioDescription', 'Toggle audio description')}
              aria-pressed={audioDescOn}
              title={t('content.player.toggleAudioDescription', 'Toggle audio description')}
            >
              <Headphones className="h-4 w-4" />
            </button>
          )}

          {signLanguageVideoUrl && (
            <button
              type="button"
              onClick={() => setSignLangOn(o => !o)}
              className={`p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 ${signLangOn ? 'bg-blue-700' : ''}`}
              aria-label={t('content.player.toggleSignLanguage', 'Toggle sign language')}
              aria-pressed={signLangOn}
              title={t('content.player.toggleSignLanguage', 'Toggle sign language')}
            >
              <Hand className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setAudioOnly(o => !o)}
            className={`p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 ${audioOnly ? 'bg-blue-700' : ''}`}
            aria-label={t('content.player.toggleAudioOnly', 'Audio-only mode')}
            aria-pressed={audioOnly}
            title={t('content.player.toggleAudioOnly', 'Audio-only mode')}
          >
            <VolumeX className="h-4 w-4 rotate-180" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeed(s => !s)}
              className="p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center gap-1 text-xs"
              aria-haspopup="menu"
              aria-expanded={showSpeed}
              aria-label={t('content.player.speed', 'Playback speed')}
            >
              <Gauge className="h-4 w-4" />
              <span>{speed}x</span>
            </button>
            {showSpeed && (
              <div
                role="menu"
                className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-md shadow-lg py-1 z-20 min-w-[80px]"
              >
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    role="menuitemradio"
                    aria-checked={speed === s}
                    type="button"
                    onClick={() => {
                      setSpeed(s);
                      setShowSpeed(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${speed === s ? 'text-blue-300' : ''}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label={fullscreen ? t('content.player.exitFullscreen', 'Exit fullscreen') : t('content.player.fullscreen', 'Fullscreen')}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {}
      {transcriptOpen && transcriptUrl && (
        <div
          className="bg-white text-gray-900 p-4 max-h-64 overflow-y-auto border-t border-gray-300"
          role="region"
          aria-label={t('content.player.transcript', 'Transcript')}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">
              {t('content.player.transcript', 'Transcript')}
            </h4>
            <button
              type="button"
              onClick={() => setTranscriptOpen(false)}
              className="p-1 rounded hover:bg-gray-100"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {transcriptLoading ? (
            <p className="text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
          ) : transcriptText ? (
            <pre className="text-sm whitespace-pre-wrap font-sans">{transcriptText}</pre>
          ) : (
            <p className="text-sm text-gray-500">
              {t('content.player.transcriptUnavailable', 'Transcript unavailable.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;

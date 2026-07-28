'use client';

import { motion } from 'framer-motion';
import { Eye, Ear, Check, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import type { Track } from '@/lib/accessibility-tracks';

/**
 * Direct dashboard picker that replaces the old multi-page disability
 * assessment. Instead of inferring a student's needs from a long questionnaire,
 * a parent (or the student) picks the dashboard that fits them in a single tap,
 * with each option spelling out exactly what that space provides.
 *
 * Used at signup (app/auth) and for re-selection in settings.
 */

export interface TrackOption {
  track: Track;
  icon: typeof Eye;
  title: string;
  who: string;
  /** The concrete things this dashboard gives the student. */
  features: string[];
  /** Design-system accent token for this option. */
  accent: 'forest' | 'coral';
}

export const TRACK_OPTIONS: TrackOption[] = [
  {
    track: 'visual',
    icon: Eye,
    title: 'Visual Support Dashboard',
    who: 'For students who are blind or have low vision',
    accent: 'forest',
    features: [
      'Audio-first lessons with spoken descriptions',
      'Screen-reader-friendly layout & full keyboard control',
      'Extra-large text, high contrast and colour filters',
      'Learning materials that come with audio descriptions',
      'Matched with teachers who specialise in visual impairment',
    ],
  },
  {
    track: 'hearing',
    icon: Ear,
    title: 'Hearing Support Dashboard',
    who: 'For students who are deaf or hard of hearing',
    accent: 'coral',
    features: [
      'Every video captioned and sign-language interpreted',
      'Transcripts for all audio content',
      'Visual alerts instead of sounds',
      'Chat-first communication tools',
      'Matched with teachers who specialise in hearing impairment',
    ],
  },
];

const ACCENT: Record<'forest' | 'coral', { ring: string; chip: string; btn: string; icon: string }> = {
  forest: {
    ring: 'hover:border-forest focus-within:border-forest',
    chip: 'bg-forest/15 text-forest-500',
    btn: 'bg-forest hover:bg-forest-500',
    icon: 'bg-forest text-cream',
  },
  coral: {
    ring: 'hover:border-coral focus-within:border-coral',
    chip: 'bg-coral/15 text-coral',
    btn: 'bg-coral hover:bg-coral-500',
    icon: 'bg-coral text-cream',
  },
};

interface Props {
  onChoose: (track: Track) => void;
  onUseStandard?: () => void;
  /** Which card is mid-submit (spinner + disabled), or null. */
  submittingTrack?: Track | null;
  isSubmitting?: boolean;
  heading?: string;
  subheading?: string;
  standardLabel?: string;
}

export function StudentTrackChooser({
  onChoose,
  onUseStandard,
  submittingTrack = null,
  isSubmitting = false,
  heading = 'Which dashboard fits you best?',
  subheading = 'Pick the space that matches your needs. Everything below is set up automatically — you can change it later in Settings.',
  standardLabel = 'My child doesn’t need a specialised dashboard — use the standard one',
}: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
          <Sparkles className="w-4" /> Choose your space
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-espresso mt-2">{heading}</h1>
        <p className="text-espresso/70 mt-3 max-w-xl mx-auto">{subheading}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {TRACK_OPTIONS.map((opt, i) => {
          const a = ACCENT[opt.accent];
          const Icon = opt.icon;
          const busy = submittingTrack === opt.track;
          const disabled = isSubmitting;
          return (
            <motion.div
              key={opt.track}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className={`flex flex-col rounded-3xl border-2 border-espresso/15 bg-cream-50 p-6 transition-all ${a.ring}`}
            >
              <div className="flex items-center gap-4 mb-4">
                <span className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ${a.icon}`}>
                  <Icon size={26} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold text-espresso leading-tight">{opt.title}</h2>
                  <p className="text-sm text-espresso/65 mt-0.5">{opt.who}</p>
                </div>
              </div>

              <span className={`inline-flex self-start items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full mb-3 ${a.chip}`}>
                What this dashboard gives you
              </span>

              <ul className="space-y-2 mb-6 flex-1">
                {opt.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-espresso/85">
                    <Check size={16} className="mt-0.5 flex-shrink-0 text-espresso/50" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => onChoose(opt.track)}
                disabled={disabled}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${a.btn}`}
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    Choose this dashboard <ArrowRight size={18} />
                  </>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {onUseStandard && (
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={onUseStandard}
            disabled={isSubmitting}
            className="text-sm font-semibold text-espresso/60 hover:text-espresso hover:underline disabled:opacity-50"
          >
            {standardLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentTrackChooser;

'use client';

/**
 * Phase N1 — Onboarding tour.
 *
 * Lightweight first-visit welcome card. Not a full tour library (which
 * adds significant bundle + accessibility overhead) — instead a single
 * dismissable card with the 3-4 things a new user actually needs to
 * know for their role. Dismissal persists to localStorage so it doesn't
 * re-appear on every login.
 *
 * Tours are role-keyed: pass `role` to render the right copy. If the
 * key is dismissed (or `localStorage` is unavailable, e.g. SSR), the
 * component renders nothing.
 *
 * Mounted at the top of each dashboard page rather than the root layout
 * so the banner appears in-context (above the dashboard content) rather
 * than as a global toast.
 */

import React, { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

type Role = 'student' | 'teacher' | 'sponsor' | 'guardian';

interface Step {
  title: string;
  body: string;
}

const TOURS: Record<Role, { heading: string; steps: Step[] }> = {
  student: {
    heading: 'Welcome to SkillHub!',
    steps: [
      {
        title: 'Find a course',
        body: 'Browse the content library or live sessions for your subjects.',
      },
      {
        title: 'Make it accessible',
        body: 'Open the accessibility panel to set captions, large text, dictation, and more.',
      },
      {
        title: 'Track your progress',
        body: 'Your dashboard shows enrolled courses, upcoming sessions, and earned certificates.',
      },
      {
        title: 'Connect with peers',
        body: 'Use Find a Study Buddy to discover students with similar interests.',
      },
    ],
  },
  teacher: {
    heading: 'Welcome, teacher!',
    steps: [
      {
        title: 'Create your first course',
        body: 'Head to Content → Upload to publish a lesson or schedule a live session.',
      },
      {
        title: 'Add accessibility',
        body: 'Attach captions, transcripts, audio descriptions, and sign-language videos to your content.',
      },
      {
        title: 'Review submissions',
        body: 'Open Exams to author quizzes and see how your students are scoring.',
      },
      {
        title: 'Track your impact',
        body: 'Analytics shows hours taught, retention, and earnings over time.',
      },
    ],
  },
  sponsor: {
    heading: 'Welcome, sponsor!',
    steps: [
      {
        title: 'Create a scholarship',
        body: 'Fund students by opening a scholarship — set slots, target disabilities, and locations.',
      },
      {
        title: 'Or mint access codes',
        body: 'Hand out one-time codes that credit a student’s account directly.',
      },
      {
        title: 'Review applications',
        body: 'Approve eligible students and watch the matching engine notify them.',
      },
      {
        title: 'Measure your impact',
        body: 'The Impact page shows funded students, completion rates, and geographic spread.',
      },
    ],
  },
  guardian: {
    heading: 'Welcome, guardian.',
    steps: [
      {
        title: 'Your students',
        body: 'The dashboard lists every student you’re linked to.',
      },
      {
        title: 'Track progress',
        body: 'See active courses, upcoming sessions, and accessibility settings (where permitted).',
      },
      {
        title: 'Communicate',
        body: 'Use the chat to coordinate with the student’s teachers.',
      },
    ],
  },
};

const STORAGE_KEY = 'skillhub_onboarded_v1';

function isDismissed(role: Role): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return !!parsed[role];
  } catch {
    return false;
  }
}

function markDismissed(role: Role) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[role] = true;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
  }
}

export function OnboardingTour({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isDismissed(role)) setOpen(true);
  }, [role]);

  if (!open) return null;
  const tour = TOURS[role];

  const dismiss = () => {
    markDismissed(role);
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label={tour.heading}
      className="relative mx-4 mt-4 mb-6 bg-cream-100 border-2 border-espresso/15 rounded-2xl p-5 shadow-kid"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute top-3 right-3 p-1 rounded-full hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      >
        <X className="h-4 w-4 text-espresso/55" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-5 w-5 text-terracotta" aria-hidden />
        <h2 className="text-lg font-bold text-espresso">{tour.heading}</h2>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-decimal list-inside text-sm">
        {tour.steps.map((s, i) => (
          <li key={i} className="bg-cream-50 border-2 border-espresso/10 rounded-xl p-3 marker:text-terracotta marker:font-bold">
            <p className="font-semibold text-espresso inline">{s.title}</p>
            <p className="text-espresso/70 mt-0.5">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="btn-kid-primary text-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default OnboardingTour;

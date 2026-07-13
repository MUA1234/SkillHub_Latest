'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccessibility } from '@/contexts/AccessibilityContext';
import { Button } from '@/components/ui/button';

/**
 * BreakReminder Component
 *
 * Shows periodic break reminders for users who need regular breaks
 * (especially helpful for ADHD, autism, and visual fatigue).
 */
export const BreakReminder: React.FC = () => {
  const { preferences } = useAccessibility();
  const [showReminder, setShowReminder] = useState(false);
  const [timeUntilBreak, setTimeUntilBreak] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);

  const BREAK_DURATION = 5 * 60;

  const resetTimer = useCallback(() => {
    setTimeUntilBreak(preferences.break_interval_minutes * 60);
    setShowReminder(false);
    setIsOnBreak(false);
  }, [preferences.break_interval_minutes]);

  const startBreak = () => {
    setIsOnBreak(true);
    setBreakTimeLeft(BREAK_DURATION);
    setShowReminder(false);
  };

  const skipBreak = () => {
    resetTimer();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!preferences.break_reminders) return;

    const interval = setInterval(() => {
      if (isOnBreak) {
        setBreakTimeLeft((prev) => {
          if (prev <= 1) {
            resetTimer();
            return 0;
          }
          return prev - 1;
        });
      } else {
        setTimeUntilBreak((prev) => {
          if (prev <= 1) {
            setShowReminder(true);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [preferences.break_reminders, isOnBreak, resetTimer]);

  useEffect(() => {
    if (preferences.break_reminders) {
      resetTimer();
    }
  }, [preferences.break_reminders, resetTimer]);

  if (!preferences.break_reminders) return null;

  if (isOnBreak) {
    return (
      <div className="fixed inset-0 z-[100000] slab-dark flex items-center justify-center">
        <div className="text-center text-cream max-w-md mx-auto p-8">
          <div className="mb-8">
            <svg
              className="w-24 h-24 mx-auto animate-pulse text-mustard"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4">Break Time</h2>
          <p className="text-lg text-cream/75 mb-6">
            Take a moment to rest your eyes, stretch, or take a short walk.
          </p>
          <div className="text-6xl font-mono font-bold mb-8 text-mustard">{formatTime(breakTimeLeft)}</div>
          <div className="space-y-4">
            <p className="text-sm text-cream/60">Break activities:</p>
            <ul className="text-left text-cream/80 space-y-2 max-w-xs mx-auto">
              <li className="flex items-center gap-2">
                <span>👀</span> Look at something 20 feet away for 20 seconds
              </li>
              <li className="flex items-center gap-2">
                <span>🧘</span> Take 5 deep breaths
              </li>
              <li className="flex items-center gap-2">
                <span>💧</span> Drink some water
              </li>
              <li className="flex items-center gap-2">
                <span>🚶</span> Stand up and stretch
              </li>
            </ul>
          </div>
          <Button
            variant="outline"
            className="mt-8 btn-kid-cream"
            onClick={() => setIsOnBreak(false)}
          >
            End Break Early
          </Button>
        </div>
      </div>
    );
  }

  if (showReminder) {
    return (
      <div className="fixed inset-0 z-[100000] bg-espresso/55 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-cream-50 border-2 border-espresso rounded-3xl shadow-kid-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-mustard-100 border-2 border-espresso rounded-full flex items-center justify-center mx-auto mb-6 shadow-sticker-sm">
            <svg
              className="w-8 h-8 text-espresso"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-espresso mb-2">Time for a Break!</h2>
          <p className="text-espresso/70 mb-6">
            You&apos;ve been studying for {preferences.break_interval_minutes} minutes.
            Taking regular breaks helps you stay focused and retain information better.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={startBreak} className="w-full btn-kid-primary">
              Take a 5-Minute Break
            </Button>
            <Button variant="outline" onClick={skipBreak} className="w-full btn-kid-ghost">
              Skip This Time
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default BreakReminder;

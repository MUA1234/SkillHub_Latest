'use client';

/**
 * PWA "Install app" button.
 *
 * Listens for the browser's `beforeinstallprompt` event (Chromium-based
 * browsers; Safari/iOS uses the share menu and has no event). When the
 * event fires we cache it, render a discreet pill in the navbar slot
 * the caller mounts us in, and call `prompt()` on click.
 *
 * We deliberately don't auto-trigger: an un-prompted load is treated as
 * a "no" by the browser permission cache, so the user would burn their
 * one shot. Same reasoning as the push-permission flow in Phase F3.
 *
 * The button hides itself permanently once the user accepts (the event
 * won't fire again) or dismisses with the "Not now" affordance — the
 * dismiss is remembered in localStorage so the prompt doesn't nag.
 */

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'skillhub_pwa_install_dismissed_v1';

export function PWAInstallButton({ className = '' }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      setHidden(true);
      return;
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || !deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        setHidden(true);
      } else {
      }
    } catch {
    } finally {
      setDeferred(null);
    }
  };

  const dismissForever = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
    }
    setHidden(true);
  };

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        onClick={install}
        className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-full bg-terracotta text-cream font-semibold border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
        aria-label="Install SkillHub app"
      >
        <Download className="w-4 h-4" aria-hidden /> Install app
      </button>
      <button
        onClick={dismissForever}
        className="text-xs text-espresso/55 hover:text-espresso"
        aria-label="Don't show this again"
      >
        Not now
      </button>
    </span>
  );
}

export default PWAInstallButton;

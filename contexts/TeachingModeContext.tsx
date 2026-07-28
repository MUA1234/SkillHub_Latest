'use client';

/**
 * Shares the teacher's active teaching mode (general / visual / hearing) across
 * the whole teacher area, so the dashboard switch and the upload form agree.
 * Persisted to localStorage; seeded from the teacher's chosen tracks on first
 * visit. See lib/teaching-mode.ts.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  TeachingMode,
  readStoredMode,
  writeStoredMode,
  defaultModeForTracks,
} from '@/lib/teaching-mode';
import { getCurrentUser } from '@/lib/api';

interface TeachingModeContextValue {
  mode: TeachingMode;
  setMode: (mode: TeachingMode) => void;
  ready: boolean;
}

const Ctx = createContext<TeachingModeContextValue>({
  mode: 'general',
  setMode: () => {},
  ready: false,
});

export function TeachingModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<TeachingMode>('general');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredMode();
    if (stored) {
      setModeState(stored);
    } else {
      const user = getCurrentUser() as any;
      const seeded = defaultModeForTracks(user?.teaching_tracks);
      setModeState(seeded);
      writeStoredMode(seeded);
    }
    setReady(true);
  }, []);

  const setMode = useCallback((next: TeachingMode) => {
    setModeState(next);
    writeStoredMode(next);
  }, []);

  return <Ctx.Provider value={{ mode, setMode, ready }}>{children}</Ctx.Provider>;
}

export function useTeachingMode(): TeachingModeContextValue {
  return useContext(Ctx);
}

'use client';

/**
 * The teacher's dashboard switcher — a dropdown that hard-swaps the entire
 * dashboard between the three teaching contexts (General / Visual / Hearing).
 * Picking a mode changes the shared TeachingMode; the dashboard router then
 * mounts a completely different dashboard, so no trace of the other one remains.
 *
 * Rendered as a slim sticky bar that sits right under the top navigation.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Users, Eye, Ear, Check } from 'lucide-react';
import { useTeachingMode } from '@/contexts/TeachingModeContext';
import { TEACHING_MODES, teachingModeConfig, TeachingMode } from '@/lib/teaching-mode';

const ICONS: Record<TeachingMode, React.ReactNode> = {
  general: <Users className="h-4 w-4" />,
  visual: <Eye className="h-4 w-4" />,
  hearing: <Ear className="h-4 w-4" />,
};

const DOT: Record<'terracotta' | 'forest' | 'coral', string> = {
  terracotta: 'bg-terracotta',
  forest: 'bg-forest',
  coral: 'bg-coral',
};

export default function TeachingModeDropdown() {
  const { mode, setMode } = useTeachingMode();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = teachingModeConfig(mode);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-6 border-b-2 border-espresso/10 bg-cream-100/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-espresso/50">Teaching dashboard</span>
          <p className="font-display font-bold text-espresso leading-tight truncate">{active.label}</p>
        </div>

        <div className="relative shrink-0" ref={ref}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border-2 border-espresso bg-cream-50 px-4 py-2 font-bold text-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
          >
            <span className={`grid h-6 w-6 place-items-center rounded-full text-cream ${DOT[active.accent]}`}>{ICONS[mode]}</span>
            <span className="hidden sm:inline">{active.short}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <ul
              role="listbox"
              aria-label="Choose teaching dashboard"
              className="absolute right-0 mt-2 w-72 rounded-2xl border-2 border-espresso bg-cream-50 shadow-kid-lg overflow-hidden"
            >
              {TEACHING_MODES.map((m) => {
                const cfg = teachingModeConfig(m);
                const selected = m === mode;
                return (
                  <li key={m} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => { setMode(m); setOpen(false); }}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${
                        selected ? 'bg-espresso/5' : 'hover:bg-espresso/5'
                      }`}
                    >
                      <span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-xl text-cream shrink-0 ${DOT[cfg.accent]}`}>
                        {ICONS[m]}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 font-bold text-espresso">
                          {cfg.label}
                          {selected && <Check className="h-4 w-4 text-forest" />}
                        </span>
                        <span className="block text-xs text-espresso/60 mt-0.5">{cfg.audience}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

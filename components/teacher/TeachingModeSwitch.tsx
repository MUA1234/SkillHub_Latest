'use client';

/**
 * The teacher's "main switch" — flips the single dashboard between the three
 * teaching contexts (General / Visual / Hearing). Changing it updates the
 * shared TeachingMode, which in turn re-frames the dashboard and constrains
 * what the content uploader accepts.
 */

import { Users, Eye, Ear, Check } from 'lucide-react';
import { useTeachingMode } from '@/contexts/TeachingModeContext';
import { TEACHING_MODES, teachingModeConfig, TeachingMode } from '@/lib/teaching-mode';

const ICONS: Record<TeachingMode, React.ReactNode> = {
  general: <Users className="h-5 w-5" />,
  visual: <Eye className="h-5 w-5" />,
  hearing: <Ear className="h-5 w-5" />,
};

const ACTIVE: Record<'terracotta' | 'forest' | 'coral', string> = {
  terracotta: 'bg-terracotta text-cream border-espresso',
  forest: 'bg-forest text-cream border-espresso',
  coral: 'bg-coral text-cream border-espresso',
};

export default function TeachingModeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTeachingMode();
  const active = teachingModeConfig(mode);

  return (
    <section
      className="rounded-3xl border-2 border-espresso/10 bg-cream-50 p-4 sm:p-5 shadow-kid"
      aria-label="Teaching mode switch"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Teaching mode</span>
          {!compact && (
            <p className="text-sm text-espresso/70 mt-0.5">
              Switch which students you&apos;re working with. This changes what you can upload.
            </p>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Choose teaching mode" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TEACHING_MODES.map((m) => {
          const cfg = teachingModeConfig(m);
          const selected = m === mode;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={selected}
              onClick={() => setMode(m)}
              className={`text-left rounded-2xl border-2 p-4 transition-all ${
                selected
                  ? `${ACTIVE[cfg.accent]} shadow-sticker-sm`
                  : 'bg-cream-50 text-espresso border-espresso/15 hover:border-espresso/40 hover:-translate-y-0.5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? 'bg-cream/20' : 'bg-espresso text-cream'}`}>
                  {ICONS[m]}
                </span>
                {selected && <Check className="h-5 w-5" />}
              </div>
              <p className="font-display font-bold mt-2 leading-tight">{cfg.label}</p>
              <p className={`text-xs mt-0.5 ${selected ? 'text-cream/80' : 'text-espresso/55'}`}>{cfg.audience}</p>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-espresso/70 mt-3 flex items-start gap-1.5">
        <span aria-hidden>ℹ️</span>
        <span><strong>{active.label}:</strong> {active.uploadRule}</span>
      </p>
    </section>
  );
}

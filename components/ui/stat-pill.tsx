
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

type Tone = 'cream' | 'mustard' | 'terracotta' | 'forest' | 'espresso';

const BADGE: Record<Tone, string> = {
  cream:      'bg-cream-200 text-espresso',
  mustard:    'bg-mustard text-espresso',
  terracotta: 'bg-terracotta text-cream',
  forest:     'bg-forest text-cream',
  espresso:   'bg-espresso text-cream',
};

export function StatPill({
  badge,
  value,
  label,
  tone = 'mustard',
  className,
  onDark = true,
}: {
  badge: ReactNode;
  value: ReactNode;
  label: ReactNode;
  tone?: Tone;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl px-5 py-4',
        onDark ? 'bg-espresso/80 text-cream border border-cream/10' : 'bg-cream-50 text-espresso border border-espresso/10',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-display font-bold',
          BADGE[tone],
        )}
      >
        {badge}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-display text-2xl font-bold tracking-tight">{value}</span>
        <span className={cn('text-xs font-medium', onDark ? 'text-cream/70' : 'text-espresso/60')}>{label}</span>
      </div>
    </div>
  );
}

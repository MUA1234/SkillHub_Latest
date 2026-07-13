
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

const TONE = {
  cream:      'bg-cream-50 text-espresso border-espresso/10',
  mustard:    'bg-mustard text-espresso border-espresso/15',
  terracotta: 'bg-terracotta text-cream border-cream/20',
  forest:     'bg-forest text-cream border-cream/20',
  espresso:   'bg-espresso text-cream border-cream/15',
  outline:    'bg-transparent text-espresso border-espresso/30',
} as const;

export function TagPill({
  children,
  tone = 'cream',
  className,
  icon,
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {icon && <span className="grid place-items-center">{icon}</span>}
      {children}
    </span>
  );
}

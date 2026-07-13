'use client';


import { cn } from '@/lib/utils';
import { ReactNode, HTMLAttributes } from 'react';

type Tone = 'cream' | 'mustard' | 'terracotta' | 'forest' | 'espresso';

const TONE: Record<Tone, string> = {
  cream:      'bg-cream-100 text-ink',
  mustard:    'bg-mustard text-espresso',
  terracotta: 'bg-terracotta text-cream',
  forest:     'bg-forest text-cream',
  espresso:   'bg-espresso text-cream',
};

const TILT = {
  none:  '',
  left:  '-rotate-1',
  right: 'rotate-1',
} as const;

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  tilt?: keyof typeof TILT;
  sticker?: boolean;
  bordered?: boolean;
  children: ReactNode;
};

export function KidCard({
  tone = 'cream',
  tilt = 'none',
  sticker = false,
  bordered = true,
  className,
  children,
  ...rest
}: Props) {
  return (
    <div
      className={cn(
        'rounded-3xl p-6 transition-transform duration-200',
        TONE[tone],
        TILT[tilt],
        bordered && 'border-2 border-espresso',
        sticker ? 'shadow-sticker hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-sticker-sm' : 'shadow-kid hover:shadow-kid-lg',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function KidFeatureCard({
  title,
  body,
  tone = 'cream',
  tilt = 'none',
  illustration,
  cta,
}: {
  title: ReactNode;
  body: ReactNode;
  tone?: Tone;
  tilt?: keyof typeof TILT;
  illustration?: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <KidCard tone={tone} tilt={tilt} sticker className="flex flex-col gap-4 min-h-[260px]">
      <h3 className="font-display text-2xl font-semibold leading-tight">{title}</h3>
      <p className={cn('text-sm leading-relaxed', tone === 'cream' ? 'text-espresso/75' : 'opacity-90')}>{body}</p>
      <div className="mt-auto flex items-end justify-between gap-4">
        {cta}
        {illustration && <div className="ml-auto">{illustration}</div>}
      </div>
    </KidCard>
  );
}

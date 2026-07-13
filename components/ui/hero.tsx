'use client';


import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { DoodleCluster } from './doodle';

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  tags?: ReactNode;
  primaryCta?: ReactNode;
  secondaryCta?: ReactNode;
  media?: ReactNode;
  tone?: 'dark' | 'light';
  doodles?: boolean;
  className?: string;
};

export function Hero({
  eyebrow,
  title,
  body,
  tags,
  primaryCta,
  secondaryCta,
  media,
  tone = 'dark',
  doodles = true,
  className,
}: Props) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[2.5rem] px-6 sm:px-10 md:px-14 py-10 md:py-14',
        tone === 'dark' ? 'slab-dark' : 'slab-cream',
        className,
      )}
    >
      {doodles && <DoodleCluster tone={tone === 'dark' ? 'mustard' : 'terracotta'} />}

      <div className="relative grid gap-10 md:gap-6 md:grid-cols-[1.2fr_1fr] items-center">
        <div className="flex flex-col gap-5">
          {eyebrow && (
            <span
              className={cn(
                'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] w-fit',
                tone === 'dark' ? 'text-mustard' : 'text-terracotta',
              )}
            >
              {eyebrow}
            </span>
          )}
          <h1
            className={cn(
              'font-display font-bold leading-[1.05] tracking-tight text-4xl sm:text-5xl md:text-6xl',
              tone === 'dark' ? 'text-cream' : 'text-espresso',
            )}
          >
            {title}
          </h1>
          {body && (
            <p className={cn('text-base sm:text-lg max-w-xl', tone === 'dark' ? 'text-cream/75' : 'text-espresso/75')}>
              {body}
            </p>
          )}

          {tags && <div className="flex flex-wrap gap-2 mt-1">{tags}</div>}

          {(primaryCta || secondaryCta) && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {primaryCta}
              {secondaryCta}
            </div>
          )}
        </div>

        {media && (
          <div className="relative flex items-center justify-center md:justify-end animate-pop-in">
            {media}
          </div>
        )}
      </div>
    </section>
  );
}

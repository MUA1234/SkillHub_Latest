
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export function SectionHeader({
  eyebrow,
  title,
  accent,
  body,
  tone = 'dark',
  align = 'left',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  accent?: ReactNode;
  body?: ReactNode;
  tone?: 'dark' | 'light';
  align?: 'left' | 'center';
  className?: string;
}) {
  let rendered: ReactNode = title;
  if (typeof title === 'string' && accent && title.includes('{accent}')) {
    const [before, after] = title.split('{accent}');
    rendered = (
      <>
        {before}
        <span className="handwritten scribble-under text-terracotta">{accent}</span>
        {after}
      </>
    );
  }

  return (
    <header
      className={cn(
        'flex flex-col gap-3 max-w-3xl',
        align === 'center' && 'mx-auto text-center items-center',
        className,
      )}
    >
      {eyebrow && (
        <span
          className={cn(
            'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]',
            tone === 'dark' ? 'text-mustard' : 'text-terracotta',
          )}
        >
          {eyebrow}
        </span>
      )}
      <h1
        className={cn(
          'font-display font-bold leading-[1.05] tracking-tight',
          'text-4xl sm:text-5xl md:text-6xl',
          tone === 'dark' ? 'text-cream' : 'text-espresso',
        )}
      >
        {rendered}
      </h1>
      {body && (
        <p className={cn('text-base sm:text-lg max-w-2xl', tone === 'dark' ? 'text-cream/75' : 'text-espresso/75')}>
          {body}
        </p>
      )}
    </header>
  );
}

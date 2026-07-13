
import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

type DoodleProps = SVGProps<SVGSVGElement> & { className?: string };

export function DoodleStar({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M16 2.4c.6 4.6 1.6 9 4.1 11.4 2.4 2.5 6.7 3.5 11.3 4.1-4.6.6-9 1.6-11.3 4.1-2.5 2.4-3.5 6.7-4.1 11.3-.6-4.6-1.6-9-4.1-11.3C9.4 19.5 5.1 18.5.5 18c4.6-.6 9-1.6 11.4-4.1C14.4 11.4 15.4 7.1 16 2.4z" />
    </svg>
  );
}

export function DoodleSparkle({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="M5.5 5.5l3 3M15.5 15.5l3 3M5.5 18.5l3-3M15.5 8.5l3-3" opacity=".6" />
    </svg>
  );
}

export function DoodleSquiggle({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 120 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M2 14 Q 14 2, 26 14 T 50 14 T 74 14 T 98 14 T 118 14" />
    </svg>
  );
}

export function DoodleArrow({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M6 14 C 26 8, 56 12, 70 38 C 76 50, 70 62, 56 66" />
      <path d="M48 58 L 56 66 L 64 58" />
    </svg>
  );
}

export function DoodleCircle({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 200 80" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M14 42 C 14 16, 60 6, 110 8 C 160 10, 192 22, 190 44 C 188 64, 140 76, 86 74 C 36 72, 12 60, 12 42 Z" />
    </svg>
  );
}

export function DoodleDots({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 60 60" fill="currentColor" className={cn('inline-block', className)} aria-hidden {...rest}>
      {[
        [8, 10], [22, 6], [38, 12], [52, 8],
        [12, 30], [30, 24], [48, 32],
        [8, 50], [26, 48], [44, 54], [56, 46],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2.2" />
      ))}
    </svg>
  );
}

export function DoodleHeart({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M16 28 C 4 19, 2 10, 9 6 C 13 4, 16 8, 16 8 C 16 8, 19 4, 23 6 C 30 10, 28 19, 16 28 Z" />
    </svg>
  );
}

export function DoodleZigzag({ className, ...rest }: DoodleProps) {
  return (
    <svg viewBox="0 0 80 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={cn('inline-block', className)} aria-hidden {...rest}>
      <path d="M2 14 L 12 4 L 22 14 L 32 4 L 42 14 L 52 4 L 62 14 L 72 4 L 78 12" />
    </svg>
  );
}

export function DoodleCluster({ tone = 'mustard' }: { tone?: 'mustard' | 'terracotta' | 'forest' | 'cream' }) {
  const c = {
    mustard:    'text-mustard',
    terracotta: 'text-terracotta',
    forest:     'text-forest',
    cream:      'text-cream',
  }[tone];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <DoodleStar     className={cn('absolute top-[8%]  left-[6%]  w-6 animate-wiggle',     c)} />
      <DoodleSparkle  className={cn('absolute top-[14%] right-[10%] w-8 animate-float',     c)} />
      <DoodleSquiggle className={cn('absolute bottom-[12%] left-[12%] w-24 opacity-70',     c)} />
      <DoodleDots     className={cn('absolute bottom-[20%] right-[8%] w-16 opacity-60',     c)} />
      <DoodleZigzag   className={cn('absolute top-[50%] left-[3%]   w-16 opacity-70',       c)} />
    </div>
  );
}

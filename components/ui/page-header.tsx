
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  accent?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, accent, body, actions, className }: Props) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">{eyebrow}</span>
        )}
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-espresso leading-tight mt-1">
          {title}
          {accent && (
            <>
              {' '}
              <span className="handwritten scribble-under text-terracotta">{accent}</span>
            </>
          )}
        </h1>
        {body && <p className="text-sm sm:text-base text-espresso/65 mt-2 max-w-xl">{body}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

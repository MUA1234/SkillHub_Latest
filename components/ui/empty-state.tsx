
import { ReactNode } from 'react';
import { Illustration } from './illustration';
import { KidCard } from './kid-card';
import type { IllustrationName } from '@/lib/design/illustrations';

type Props = {
  illustration?: IllustrationName;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZES = {
  sm: { box: 'py-8',  art: 120, title: 'text-lg'   },
  md: { box: 'py-10', art: 160, title: 'text-xl'   },
  lg: { box: 'py-14', art: 200, title: 'text-2xl'  },
};

export function EmptyState({
  illustration = 'empty-search',
  title,
  body,
  actions,
  size = 'md',
  className,
}: Props) {
  const s = SIZES[size];
  return (
    <KidCard tone="cream" className={className ?? `flex flex-col items-center text-center ${s.box}`}>
      <Illustration name={illustration} size={s.art} />
      <h3 className={`font-display font-bold text-espresso mt-2 ${s.title}`}>{title}</h3>
      {body && <p className="text-sm text-espresso/65 mt-1 max-w-md">{body}</p>}
      {actions && <div className="mt-5 flex flex-wrap gap-3 justify-center">{actions}</div>}
    </KidCard>
  );
}

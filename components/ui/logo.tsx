'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

const DIMS: Record<Size, { w: number; h: number }> = {
  sm: { w: 120, h: 36 },
  md: { w: 160, h: 48 },
  lg: { w: 220, h: 64 },
};

export function Logo({
  size = 'md',
  className,
  priority,
}: {
  size?: Size;
  className?: string;
  priority?: boolean;
}) {
  const { w, h } = DIMS[size];
  return (
    <Image
      src="/skillhub-logo.png"
      alt="SkillHub"
      width={w}
      height={h}
      priority={priority}
      className={cn('object-contain', className)}
      draggable={false}
    />
  );
}

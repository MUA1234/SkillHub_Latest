'use client';


import Image from 'next/image';
import { ILLUSTRATIONS, type IllustrationName } from '@/lib/design/illustrations';
import { cn } from '@/lib/utils';

type Props = {
  name: IllustrationName;
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
  /** Disable the rounded photo frame when the caller wants raw fill. */
  rounded?: boolean;
  /** Use object-contain instead of cover (rare — only for letterbox cases). */
  contain?: boolean;
};

export function Illustration({
  name,
  size = 240,
  className,
  priority,
  alt,
  rounded = true,
  contain = false,
}: Props) {
  const src = ILLUSTRATIONS[name];
  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'relative shrink-0 select-none overflow-hidden',
        rounded && 'rounded-2xl border-2 border-espresso/15',
        className,
      )}
    >
      <Image
        src={src.url}
        alt={alt ?? src.alt}
        fill
        priority={priority}
        sizes={`${size}px`}
        className={contain ? 'object-contain' : 'object-cover'}
        draggable={false}
      />
    </div>
  );
}

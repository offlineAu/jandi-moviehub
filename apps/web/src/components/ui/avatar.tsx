'use client';

import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn, initials } from '@/lib/utils';

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl',
};

export function Avatar({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-raised ring-1 ring-white/10',
        sizes[size],
        className,
      )}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 400 : 0}
        className="flex size-full items-center justify-center bg-[linear-gradient(135deg,#3b1d5e,#5b1a3f)] font-display font-semibold text-white"
        aria-hidden="true"
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

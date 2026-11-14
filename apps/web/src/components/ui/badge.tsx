import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-5 [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        neutral: 'border-border-strong bg-glass-2 text-foreground',
        outline: 'border-border-strong text-muted',
        playable: 'border-success/30 bg-[#052e22]/90 text-[#6ee7b7]',
        demo: 'border-warning/40 bg-[#3b2a05]/90 text-[#fcd34d]',
        live: 'border-transparent bg-brand text-white',
        primary: 'border-primary/40 bg-primary/15 text-[#d8b4fe]',
        danger: 'border-danger/40 bg-danger/10 text-[#fecaca]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

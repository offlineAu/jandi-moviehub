'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { DialogOverlay } from './dialog';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-4 border-border-strong bg-surface shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200',
  {
    variants: {
      side: {
        bottom:
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
        left: 'inset-y-0 left-0 h-full w-[min(20rem,85vw)] border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
        right:
          'inset-y-0 right-0 h-full w-[min(22rem,90vw)] border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
      },
    },
    defaultVariants: { side: 'bottom' },
  },
);

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>
>(({ side = 'bottom', className, children, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <DialogOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), 'p-5', className)}
      {...props}
    >
      {side === 'bottom' ? (
        <div aria-hidden="true" className="mx-auto -mt-1 h-1 w-10 rounded-full bg-white/20" />
      ) : null}
      {children}
      <SheetPrimitive.Close
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted hover:bg-white/[0.06] hover:text-foreground focus-ring"
        aria-label="Close"
      >
        <X className="size-4" aria-hidden="true" />
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

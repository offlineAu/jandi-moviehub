'use client';

import { Tooltip as TooltipPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

/** Lets overlays render inside a fullscreen element (e.g. the video player) instead of <body>. */
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => {
  const container = React.useContext(PortalContainerContext);
  return (
    <TooltipPrimitive.Portal container={container ?? undefined}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-[60] max-w-xs rounded-md border border-border-strong bg-[#0f0f1a] px-2.5 py-1.5 text-xs font-medium text-foreground shadow-xl data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = 'TooltipContent';

/** Convenience wrapper: `<Tooltip label="…"><button/></Tooltip>`. */
export function Tooltip({
  label,
  children,
  side,
  disabled,
}: {
  label: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
}) {
  if (disabled) return children;
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipRoot>
  );
}

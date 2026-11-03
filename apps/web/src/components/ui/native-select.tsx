import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldBase } from './input';

/** Native <select> (keeps platform pickers on phones) dressed to match the other fields. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <span className={cn('relative block', className)}>
    <select
      ref={ref}
      className={cn(fieldBase, 'h-11 cursor-pointer appearance-none truncate pr-10')}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
      aria-hidden="true"
    />
  </span>
));
NativeSelect.displayName = 'NativeSelect';

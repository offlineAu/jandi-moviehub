import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldBase =
  'w-full rounded-xl border border-white/[0.09] bg-[#0f0f1a]/90 px-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] placeholder:text-subtle transition-[border-color,box-shadow,background-color] duration-300 ease-[var(--ease-expo)] outline-none hover:border-white/[0.16] hover:bg-[#13131f] focus-visible:border-primary/70 focus-visible:bg-[#11111d] focus-visible:shadow-[0_0_0_4px_rgb(168_85_247/0.18),0_0_24px_-6px_rgb(236_72_153/0.45)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:focus-visible:shadow-[0_0_0_4px_rgb(248_113_113/0.2)]';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      fieldBase,
      'h-11 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, 'min-h-24 resize-y py-2.5 leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

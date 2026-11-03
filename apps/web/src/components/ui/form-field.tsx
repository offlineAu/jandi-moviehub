'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

interface FormFieldProps {
  label: React.ReactNode;
  /** Must match the id of the control rendered as children. */
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  /** Extra element rendered on the label row (e.g. "Forgot password?"). */
  aside?: React.ReactNode;
  children: React.ReactElement<Record<string, unknown>>;
}

/**
 * Label + control + hint/error. Wires `aria-invalid` and `aria-describedby` onto the child control.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  className,
  aside,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = React.cloneElement(children, {
    id: htmlFor,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {aside}
      </div>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-[#fecaca]"
    >
      {message}
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-secondary/40 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="grid size-12 place-items-center rounded-full bg-white/[0.05] text-muted ring-1 ring-white/10">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="grid max-w-sm gap-1.5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {description ? <p className="text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

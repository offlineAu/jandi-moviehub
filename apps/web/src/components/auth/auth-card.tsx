import * as React from 'react';
import { Reveal } from '@/components/motion/reveal';

/** Auth forms sit on a ticket: notched sides, perforated footer. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Reveal immediate blur y={32} className="w-full max-w-[26rem]">
      <div className="ticket-sides rounded-2xl border border-border-strong bg-surface/85 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.95)] backdrop-blur-xl [--notch:12px]">
        <div className="px-6 pb-7 pt-8 sm:px-8">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
          <div className="mt-7">{children}</div>
        </div>
        {footer ? (
          <div className="border-t-2 border-dashed border-white/10 px-6 py-4 text-center text-sm text-muted sm:px-8">
            {footer}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

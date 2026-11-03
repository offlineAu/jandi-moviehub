import { LogoMark } from '@/components/layout/logo';
import { cn } from '@/lib/utils';

/** Route-level loading state: the logo's echo glyphs breathing in and out of sync. */
export function CinemaLoader({
  label = 'Loading page',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('grid min-h-[60dvh] place-items-center', className)}
    >
      <div className="relative grid place-items-center">
        <span
          aria-hidden="true"
          className="absolute size-24 animate-ping rounded-[30px] bg-primary/20 [animation-duration:1.8s]"
        />
        <LogoMark
          animate="loop"
          className="relative size-14 drop-shadow-[0_12px_32px_rgb(219_39_119/0.45)]"
        />
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

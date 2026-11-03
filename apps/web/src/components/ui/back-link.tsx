import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Glass pill that leads back up the hierarchy; the chevron nudges left on hover. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group/back inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-white/[0.06] pl-2.5 pr-4 text-sm font-medium text-foreground/85 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur-xl transition-[background-color,color,transform] duration-300 ease-[var(--ease-expo)] hover:bg-white/[0.11] hover:text-foreground active:scale-[0.97] focus-ring',
        className,
      )}
    >
      <ChevronLeft
        className="size-4 shrink-0 transition-transform duration-300 ease-[var(--ease-expo)] group-hover/back:-translate-x-0.5"
        aria-hidden="true"
      />
      <span className="truncate">{children}</span>
    </Link>
  );
}

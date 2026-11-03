import { Compass, House } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main
      id="main"
      className="film-grain relative grid min-h-dvh place-items-center overflow-hidden px-4 py-16"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_30%,rgb(147_51_234/0.18),transparent_70%)]"
      />
      <div className="grid max-w-lg justify-items-center gap-6 text-center">
        <Logo />
        <div className="ticket-sides w-full rounded-2xl border border-border-strong bg-surface px-8 py-10">
          <p className="font-display text-[clamp(4rem,18vw,7rem)] font-bold leading-none tracking-tighter text-white/90">
            404
          </p>
          <h1 className="mt-3 font-display text-2xl font-semibold">This reel is missing</h1>
          <p className="mt-2 text-muted">
            The page you’re looking for doesn’t exist or has moved. Check the address, or pick
            something to watch.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">
              <House aria-hidden="true" />
              Go home
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/browse">
              <Compass aria-hidden="true" />
              Browse movies
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

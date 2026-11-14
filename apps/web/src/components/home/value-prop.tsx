'use client';

import { ListVideo, MessagesSquare, MonitorPlay } from 'lucide-react';
import Link from 'next/link';
import { LogoMark } from '@/components/layout/logo';
import { IrisField } from '@/components/motion/iris-field';
import { Magnetic } from '@/components/motion/magnetic';
import { Marquee } from '@/components/motion/marquee';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { SplitWords } from '@/components/motion/split-text';
import { Tilt } from '@/components/motion/tilt';
import { Artwork } from '@/components/movies/artwork';
import { Button } from '@/components/ui/button';
import type { MovieSummary } from '@/lib/types';

const features = [
  {
    icon: MonitorPlay,
    title: 'Watch parties in sync',
    body: 'Press play once and everyone’s screen follows — pause, seek and speed stay matched for the whole room.',
  },
  {
    icon: MessagesSquare,
    title: 'Chat and react live',
    body: 'Talk through the plot twists in room chat and send reactions that float over the movie.',
  },
  {
    icon: ListVideo,
    title: 'Marathons on autopilot',
    body: 'Queue a playlist, set an intermission, and the next film starts for everyone at the same moment.',
  },
];

export function ValueProp({ posters }: { posters?: MovieSummary[] }) {
  const strip = (posters ?? []).filter((m) => m.posterUrl).slice(0, 14);
  return (
    <section aria-labelledby="value-prop-title" className="px-4 sm:px-6 lg:px-10">
      <div className="relative isolate overflow-hidden rounded-[28px] ring-1 ring-white/10">
        <IrisField className="-z-10" intensity={0.8} />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(8_8_16/0.82)_0%,rgb(8_8_16/0.55)_50%,rgb(8_8_16/0.2)_100%)]" />

        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:p-14">
          <div>
            <h2
              id="value-prop-title"
              className="font-display text-[clamp(2rem,4.6vw,3.5rem)] font-bold leading-[0.98] tracking-[-0.035em]"
            >
              <SplitWords text="Movie night, wherever everyone is." immediate={false} />
            </h2>
            <Reveal delay={0.2} y={16}>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-foreground/85">
                Jandi keeps a room of friends on the same frame — from the opening credits to the
                last scene.
              </p>
            </Reveal>
            <Stagger as="ul" className="mt-8 grid gap-5" stagger={0.09} delay={0.25}>
              {features.map((f) => (
                <StaggerItem as="li" key={f.title} className="group/feat flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-glass-2 text-primary ring-1 ring-white/10 transition-[transform,background-color] duration-300 ease-[var(--ease-expo)] group-hover/feat:-rotate-6 group-hover/feat:scale-110 group-hover/feat:bg-primary/20">
                    <f.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-foreground/75">{f.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <Reveal delay={0.15} y={32} blur>
            <Tilt className="mx-auto w-full max-w-md rounded-2xl" max={6}>
              <div className="group/ticket ticket-stub flex rounded-2xl border border-border-strong bg-surface/90 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl [--notch-x:calc(100%-6.5rem)]">
                <div className="min-w-0 flex-1 p-6">
                  <p className="text-sm text-muted">Your invitation</p>
                  <p className="mt-1 font-display text-2xl font-bold leading-tight">
                    Admit one. Or twenty.
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Free account. Host rooms, keep a watchlist, pick up where you left off.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Magnetic>
                      <Button asChild>
                        <Link href="/register">Sign up free</Link>
                      </Button>
                    </Magnetic>
                    <Button asChild variant="ghost">
                      <Link href="/login">Log in</Link>
                    </Button>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="flex w-[6.5rem] shrink-0 items-center justify-center border-l-2 border-dashed border-white/15"
                >
                  <LogoMark className="size-12 transition-transform duration-700 ease-[var(--ease-expo)] group-hover/ticket:rotate-[-8deg] group-hover/ticket:scale-110" />
                </div>
              </div>
            </Tilt>
          </Reveal>
        </div>

        {strip.length >= 6 ? (
          <Marquee label="Titles on Jandi" duration={70} className="pb-6 sm:pb-8">
            {strip.map((m) => (
              <Link
                key={m.id}
                href={`/movies/${m.id}`}
                tabIndex={-1}
                className="group/strip relative mr-3 block aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 transition-transform duration-500 ease-[var(--ease-expo)] hover:-translate-y-1.5 sm:mr-4 sm:w-28"
              >
                <Artwork src={m.posterUrl} alt={m.title} sizes="112px" fallbackTitle={m.title} />
              </Link>
            ))}
          </Marquee>
        ) : null}
      </div>
    </section>
  );
}

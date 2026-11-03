'use client';

import * as React from 'react';

/*
 * React's <ViewTransition> ships in the React canary that the Next.js App Router vendors; the
 * stable `react` package used by unit tests doesn't export it. Resolve it at runtime and fall
 * back to a fragment, so every transition here is progressive enhancement.
 */
type ClassMap = string | Record<string, string>;
type VTProps = {
  children: React.ReactNode;
  name?: string;
  enter?: ClassMap;
  exit?: ClassMap;
  update?: ClassMap;
  share?: ClassMap;
  default?: ClassMap;
};

const Impl = (React as unknown as { ViewTransition?: React.ComponentType<VTProps> }).ViewTransition;

export function ViewTransition(props: VTProps) {
  if (!Impl) return <>{props.children}</>;
  return <Impl {...props} />;
}

/** Route-level crossfade-and-rise. Lives in a `template.tsx`, which remounts per navigation. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}

/** Shared-element morph between a poster thumbnail and the same poster on the detail page. */
export function PosterMorph({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={`poster-${id}`} share="poster-morph" default="none">
      {children}
    </ViewTransition>
  );
}

/** Retry HLS loading only after playback has stopped advancing for a sustained period. */
export function createStallRecovery(options: {
  position: () => number;
  isPlaying: () => boolean;
  retry: (position: number) => boolean;
  delayMs?: number;
  maxAttempts?: number;
}) {
  const delay = options.delayMs ?? 15000;
  const maxAttempts = options.maxAttempts ?? 2;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let waitingAt: number | null = null;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const reset = () => {
    cancel();
    waitingAt = null;
    attempts = 0;
  };
  const schedule = () => {
    if (timer !== undefined || attempts >= maxAttempts || waitingAt === null) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (waitingAt === null || !options.isPlaying()) return;
      if (options.position() > waitingAt + 0.05) return reset();
      if (!options.retry(options.position())) return;
      attempts++;
      schedule();
    }, delay);
  };
  return {
    wait: () => {
      if (waitingAt === null) waitingAt = options.position();
      schedule();
    },
    progress: () => {
      if (waitingAt !== null && options.position() > waitingAt + 0.05) reset();
    },
    reset,
    dispose: cancel,
  };
}

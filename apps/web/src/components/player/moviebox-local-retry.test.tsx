import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VideoPlayer } from './video-player';
vi.mock('@/lib/queries/auth', () => ({
  useMe: () => ({ data: null }),
  resolvePreferences: () => ({
    defaultVolume: 0.8,
    captionsByDefault: false,
    captionLanguage: 'en',
  }),
}));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() {
      return false;
    }
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('offers a local MovieBox retry after a prolonged stall without sending a room command', async () => {
  const tracks = Object.assign([], { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, 'textTracks', 'get').mockReturnValue(
    tracks as unknown as TextTrackList,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const switchSource = vi.fn();
  const intent = vi.fn();
  const { container } = render(
    <TooltipProvider>
      <VideoPlayer
        title="Episode"
        mode="synced"
        canControl
        onIntent={intent}
        onSourceSwitch={switchSource}
        sources={[
          {
            assetId: 'moviebox-source:71446:5:2:480',
            label: '480p',
            format: 'MP4',
            mimeType: 'video/mp4',
            durationSec: 3000,
            url: '/video.mp4',
            captions: [],
            license: null,
          },
        ]}
      />
    </TooltipProvider>,
  );
  await waitFor(() => expect(load).toHaveBeenCalled());
  const video = container.querySelector('video')!;
  vi.useFakeTimers();
  fireEvent.waiting(video);
  act(() => vi.advanceTimersByTime(15000));
  fireEvent.click(screen.getByRole('button', { name: 'Retry my video' }));
  expect(switchSource).toHaveBeenCalledWith(true);
  expect(load).toHaveBeenCalledTimes(2);
  expect(intent).not.toHaveBeenCalled();
  fireEvent.loadedMetadata(video);
  expect(switchSource).toHaveBeenLastCalledWith(false);
});

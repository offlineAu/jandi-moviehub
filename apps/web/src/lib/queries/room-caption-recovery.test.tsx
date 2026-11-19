import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useRoomCaptionRecovery, useRoomPlaybackSources } from './rooms';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../api', () => ({ apiFetch }));
const assetId = 'kisskh-direct:71446:4:1:2513:57306';
const emptySource = { sources: [{ assetId, captions: [], url: '/video.mp4' }] };
const recovered = { assetId, captions: [{ lang: 'eng', label: 'English', url: '/english.vtt' }] };

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return function Provider({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('reproduces the original empty result remaining unchanged after the provider recovers', async () => {
  vi.useFakeTimers();
  apiFetch.mockResolvedValue(emptySource);
  const { result } = renderHook(() => useRoomPlaybackSources('room', assetId), {
    wrapper: wrapper(),
  });
  await flush();
  expect(result.current.data?.sources[0]?.captions).toEqual([]);
  apiFetch.mockResolvedValue({
    sources: [{ ...emptySource.sources[0], captions: recovered.captions }],
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(result.current.data?.sources[0]?.captions).toEqual([]);
});

it('rechecks missing captions and stops polling when they recover', async () => {
  vi.useFakeTimers();
  apiFetch.mockResolvedValueOnce({ assetId, captions: [] }).mockResolvedValue(recovered);
  const { result } = renderHook(() => useRoomCaptionRecovery('room', assetId, true), {
    wrapper: wrapper(),
  });
  await flush();
  expect(result.current.data?.captions).toEqual([]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_100);
  });
  expect(result.current.data).toEqual(recovered);
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

it('retains the existing playback source if a later refresh fails', async () => {
  vi.useFakeTimers();
  apiFetch.mockReset();
  apiFetch.mockResolvedValueOnce(emptySource).mockRejectedValue(new Error('MovieBox timed out'));
  const { result } = renderHook(() => useRoomPlaybackSources('room', assetId), {
    wrapper: wrapper(),
  });
  await flush();
  expect(result.current.data).toEqual(emptySource);
  expect(result.current.isError).toBe(false);
  let refreshed!: ReturnType<typeof result.current.refetch>;
  act(() => {
    refreshed = result.current.refetch();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    await refreshed;
  });
  await flush();
  expect(result.current.isError).toBe(true);
  expect(result.current.data).toEqual(emptySource);
});

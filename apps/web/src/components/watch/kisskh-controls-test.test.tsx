import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EmbedControlsTest } from './embed-controls-test';
import { kisskhEventSummary } from './kisskh-controls-test';

it('offers KissKH probes without marking the provider synchronized', () => {
  render(<EmbedControlsTest />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Test provider' }), {
    target: { value: 'kisskh' },
  });
  const frame = screen.getByTitle('KissKH validation player') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const pause = screen.getByRole('button', { name: 'Pause probe' }) as HTMLButtonElement;
  expect(pause.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Video is visibly playing/ }));
  fireEvent.click(pause);
  expect(post).toHaveBeenCalledWith(
    { player: true, action: 'pause' },
    'https://kisskh.megaplay.su',
  );
  expect(screen.getByRole('status').textContent).toContain('unverified');
  expect(
    (screen.getByRole('textbox', { name: 'KissKH diagnostics' }) as HTMLTextAreaElement).value,
  ).toContain('UNVERIFIED');
});

it('only accepts telemetry from the active KissKH origin and frame, with no stream URLs', () => {
  const frame = {} as Window;
  const event = {
    origin: 'https://kisskh.megaplay.su',
    source: frame,
    data: JSON.stringify({
      type: 'watching-log',
      currentTime: 12,
      duration: 600,
      url: 'https://secret.example',
    }),
  };
  expect(JSON.parse(kisskhEventSummary(event, frame)!)).toEqual({
    event: 'watching-log',
    currentTime: 12,
    duration: 600,
  });
  expect(kisskhEventSummary({ ...event, origin: 'https://other.example' }, frame)).toBeNull();
  expect(kisskhEventSummary({ ...event, source: {} as Window }, frame)).toBeNull();
});

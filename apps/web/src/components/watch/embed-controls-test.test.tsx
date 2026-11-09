import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EmbedControlsTest } from './embed-controls-test';

it('allows an explicit development command probe without claiming playback readiness', () => {
  render(<EmbedControlsTest />);
  const frame = screen.getByTitle('VidSrc validation player') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const pause = screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement;
  expect(pause.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Video is visibly playing/ }));
  expect(pause.disabled).toBe(false);
  fireEvent.click(pause);
  expect(post).toHaveBeenCalledWith({ player: true, action: 'pause' }, 'https://vidsrc.sh');
  expect(screen.getByRole('status').textContent).toContain('activation');
  expect(
    (screen.getByRole('textbox', { name: 'Player diagnostics' }) as HTMLTextAreaElement).value,
  ).toContain('execution and playback remain unconfirmed');
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  expect(screen.getByTitle('VidSrc validation player')).not.toBe(frame);
  expect(
    (screen.getByRole('checkbox', { name: /Video is visibly playing/ }) as HTMLInputElement)
      .checked,
  ).toBe(false);
});

it('does not show inert provider controls or embeds in server-rendered HTML', () => {
  const html = renderToString(<EmbedControlsTest />);
  expect(html).toContain('JavaScript has not activated yet');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('<select');
});

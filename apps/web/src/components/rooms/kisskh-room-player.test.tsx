import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { KisskhRoomPlayer } from './kisskh-room-player';
it('embeds the shared episode, labels local controls, and reloads only the local frame', () => {
  render(
    <KisskhRoomPlayer
      src="https://kisskh.megaplay.su/kisskh/57281"
      title="Money Heist Part 1 Episode 1"
    />,
  );
  const frame = screen.getByTitle('Money Heist Part 1 Episode 1 KissKH player');
  expect(frame.getAttribute('src')).toBe('https://kisskh.megaplay.su/kisskh/57281');
  expect(screen.getByText(/Play, pause and seeking are controlled individually/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reload my player' }));
  expect(screen.getByTitle('Money Heist Part 1 Episode 1 KissKH player')).not.toBe(frame);
});

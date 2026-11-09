import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { KisskhRoomPlayer } from './kisskh-room-player';
it('embeds the shared episode, labels local controls, and reloads only the local frame', () => {
  render(
    <KisskhRoomPlayer
      src="https://kisskh.megaplay.su/kisskh/57281"
      title="Money Heist Part 1 Episode 1"
      episodeHref="/watch/tv/71446/season/1/episode/1?provider=kisskh&numbering=provider"
    />,
  );
  const frame = screen.getByTitle('Money Heist Part 1 Episode 1 KissKH player');
  expect(frame.getAttribute('src')).toBe('https://kisskh.megaplay.su/kisskh/57281');
  expect(screen.getByText(/Play, pause and seeking are controlled individually/)).toBeTruthy();
  const separatePlayer = screen.getByRole('link', {
    name: 'Player blank? Open this episode separately',
  });
  expect(separatePlayer.getAttribute('href')).toBe(
    '/watch/tv/71446/season/1/episode/1?provider=kisskh&numbering=provider',
  );
  expect(separatePlayer.getAttribute('target')).toBe('_blank');
  fireEvent.click(screen.getByRole('button', { name: 'Reload my player' }));
  expect(screen.getByTitle('Money Heist Part 1 Episode 1 KissKH player')).not.toBe(frame);
});

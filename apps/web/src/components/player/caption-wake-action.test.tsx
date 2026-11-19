import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CaptionWakeAction } from './caption-wake-action';

it('reports progress and distinguishes an awake resolver with no captions', async () => {
  let finish!: (value: 'missing') => void;
  const onWake = vi.fn(
    () =>
      new Promise<'missing'>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Captions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <CaptionWakeAction onWake={onWake} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Wake resolver and check captions' }));
  expect(screen.getByText('This may take up to a minute.')).toBeTruthy();
  expect(onWake).toHaveBeenCalledTimes(1);
  finish('missing');
  expect(
    await screen.findByText('Resolver is awake, but no captions were returned. Try again later.'),
  ).toBeTruthy();
});
it('reports a failed wake rather than claiming captions exist', async () => {
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Captions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <CaptionWakeAction
          onWake={async () => {
            throw new Error('offline');
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Wake resolver and check captions' }));
  expect(await screen.findByText('Couldn’t reach the resolver. Try again shortly.')).toBeTruthy();
});

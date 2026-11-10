import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isTextEntry, MobileTabBar } from './mobile-tab-bar';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function input(type: string, readOnly = false) {
  const el = document.createElement('input');
  el.type = type;
  el.readOnly = readOnly;
  return el;
}

describe('isTextEntry', () => {
  it('treats keyboard-raising fields as text entry', () => {
    for (const type of ['text', 'search', 'email', 'password', 'number', 'datetime-local']) {
      expect(isTextEntry(input(type)), type).toBe(true);
    }
    expect(isTextEntry(document.createElement('textarea'))).toBe(true);
  });

  it('ignores toggles, buttons, read-only fields and nothing', () => {
    for (const type of ['checkbox', 'radio', 'range', 'file', 'button', 'submit']) {
      expect(isTextEntry(input(type)), type).toBe(false);
    }
    expect(isTextEntry(input('text', true))).toBe(false);
    expect(isTextEntry(document.createElement('button'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('MobileTabBar', () => {
  it('hides while the user is typing so it cannot cover the field above the keyboard', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    render(<MobileTabBar />);
    const nav = screen.getByRole('navigation', { name: 'Primary', hidden: true });
    expect(nav.getAttribute('data-typing')).toBeNull();

    // Programmatic focus (autoFocus) raises no keyboard on phones: keep the bar.
    act(() => field.focus());
    expect(nav.getAttribute('data-typing')).toBeNull();
    act(() => field.blur());

    // A tap that focuses the field does.
    act(() => {
      field.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field.focus();
    });
    expect(nav.getAttribute('data-typing')).toBe('true');
    expect(nav.classList.contains('hidden')).toBe(true);

    await act(async () => {
      field.blur();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(nav.getAttribute('data-typing')).toBeNull();
    field.remove();
  });
});

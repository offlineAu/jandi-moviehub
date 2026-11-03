import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/register',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegisterForm />
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // GET /auth/me → anonymous
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/auth/me')) {
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }),
        { status: 401 },
      );
    }
    throw new Error(`unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('RegisterForm', () => {
  it('shows inline errors from the shared schema without calling the API', async () => {
    renderForm();
    fill(/^email$/i, 'not-an-email');
    fill(/^username$/i, 'Bad Name!');
    fill(/^password$/i, 'short');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });
    await waitFor(() =>
      expect(screen.getByText('Password must be at least 10 characters')).toBeTruthy(),
    );
    expect(screen.getByText('Use 3–24 lowercase letters, numbers or underscores')).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i).getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/register'))).toBe(
      false,
    );
  });

  it('maps API conflicts and validation details onto fields', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) return new Response('{}', { status: 401 });
      return new Response(
        JSON.stringify({ error: { code: 'USERNAME_TAKEN', message: 'That username is taken' } }),
        { status: 409 },
      );
    });
    renderForm();
    fill(/^email$/i, 'film@example.com');
    fill(/^display name$/i, 'Film Fan');
    fill(/^username$/i, 'film_fan');
    fill(/^password$/i, 'a-very-long-password');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });
    await waitFor(() => expect(screen.getByText('That username is taken')).toBeTruthy());
    expect(screen.getByLabelText(/^username$/i).getAttribute('aria-invalid')).toBe('true');
    expect(replace).not.toHaveBeenCalled();
  });
});

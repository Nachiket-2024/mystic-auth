import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import RateLimitsPage from '@/rate_limits/RateLimitsPage';

const mock = new MockAdapter(api);
const initialAuthState = useAuthStore.getState();

function seed(permissions: string[], email = 'admin@example.com') {
  useAuthStore.setState(initialAuthState, true);
  useAuthStore.getState().setAuthenticated(true);
  useAuthStore.getState().setProfile({
    name: 'Test Admin',
    email,
    role: 'admin',
    permissions,
    has_password: true,
    created_at: '2026-01-15T00:00:00Z',
    active_sessions: 1,
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter>
          <RateLimitsPage />
        </MemoryRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

const IP_ENTRY = {
  key: 'login:ip:203.0.113.5',
  endpoint: 'login',
  scope: 'ip',
  identifier: '203.0.113.5',
  count: 5,
  limit: 5,
  resets_in_seconds: 42,
};

const ACCOUNT_ENTRY = {
  key: 'login:account:victim@example.com',
  endpoint: 'login',
  scope: 'account',
  identifier: 'victim@example.com',
  count: 1,
  limit: 5,
  resets_in_seconds: null,
};

describe('RateLimitsPage', () => {
  beforeEach(() => {
    mock.reset();
    seed(['rate_limits:read', 'rate_limits:reset']);
  });

  it('shows an empty state when there are no active limiters', async () => {
    mock.onGet('/rate-limits/').reply(200, { entries: [], total: 0, truncated: false });
    renderPage();

    expect(await screen.findByText('No active rate limits')).toBeInTheDocument();
  });

  it('lists active limiters with scope badges and identifiers', async () => {
    mock.onGet('/rate-limits/').reply(200, { entries: [IP_ENTRY, ACCOUNT_ENTRY], total: 2, truncated: false });
    renderPage();

    expect(await screen.findByText('203.0.113.5')).toBeInTheDocument();
    expect(screen.getByText('victim@example.com')).toBeInTheDocument();
    expect(screen.getByText('5 / 5')).toBeInTheDocument();
  });

  it('paginates via real numbered pages instead of accumulating rows, and Page 1 returns to the exact prior page', async () => {
    mock.onGet('/rate-limits/').reply((config) => {
      if (config.params?.page === 2) {
        return [200, { entries: [ACCOUNT_ENTRY], total: 11, truncated: false }];
      }
      return [200, { entries: [IP_ENTRY], total: 11, truncated: false }];
    });
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('203.0.113.5');
    const nextButton = screen.getAllByRole('button', { name: 'Next page' })[0];
    const page2Button = screen.getAllByRole('button', { name: 'Page 2' })[0];
    expect(nextButton).toBeEnabled();

    await user.click(page2Button);

    // The first page's row is gone - a page change replaces the page, it
    // never accumulates rows the way the old "Load more" button did.
    await waitFor(() => expect(screen.queryByText('203.0.113.5')).toBeNull());
    expect(await screen.findByText('victim@example.com')).toBeInTheDocument();

    const page1Button = screen.getAllByRole('button', { name: 'Page 1' })[0];
    await user.click(page1Button);

    expect(await screen.findByText('203.0.113.5')).toBeInTheDocument();
    expect(screen.queryByText('victim@example.com')).toBeNull();
  });

  it('resets a limiter via DELETE after confirming', async () => {
    mock.onGet('/rate-limits/').reply(200, { entries: [IP_ENTRY], total: 1, truncated: false });
    mock.onDelete(`/rate-limits/${encodeURIComponent(IP_ENTRY.key)}`).reply(204);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('203.0.113.5');
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(await screen.findByText(/Reset the "login" limit/)).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Reset' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mock.history.delete.length).toBe(1));
  });

  it('hides the Reset action for a caller without rate_limits:reset', async () => {
    seed(['rate_limits:read']);
    mock.onGet('/rate-limits/').reply(200, { entries: [IP_ENTRY], total: 1, truncated: false });
    renderPage();

    await screen.findByText('203.0.113.5');
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('filters by endpoint via a dropdown, not free text, resetting to a fresh first page', async () => {
    mock.onGet('/rate-limits/').reply((config) => {
      if (config.params?.endpoint === 'signup') {
        return [200, { entries: [{ ...IP_ENTRY, endpoint: 'signup' }], total: 1, truncated: false }];
      }
      return [200, { entries: [IP_ENTRY], total: 1, truncated: false }];
    });
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('203.0.113.5');

    // A real dropdown, not a text box: no free-text input to type into.
    expect(screen.queryByPlaceholderText(/filter by endpoint/i)).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Filter by endpoint' }));
    await user.click(await screen.findByRole('option', { name: 'signup' }));

    await waitFor(() => {
      const lastRequest = mock.history.get[mock.history.get.length - 1];
      expect(lastRequest.params).toMatchObject({ endpoint: 'signup', page: 1 });
    });
  });

  it('accepts the "email" (login lockout) scope filter without the request erroring', async () => {
    mock.onGet('/rate-limits/').reply((config) => {
      if (config.params?.scope === 'email') {
        return [200, { entries: [], total: 1, truncated: false }];
      }
      return [200, { entries: [IP_ENTRY], total: 1, truncated: false }];
    });
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('203.0.113.5');
    await user.click(screen.getByRole('combobox', { name: 'Filter by scope' }));
    await user.click(await screen.findByRole('option', { name: 'Login lockout' }));

    await waitFor(() => {
      const lastRequest = mock.history.get[mock.history.get.length - 1];
      expect(lastRequest.params).toMatchObject({ scope: 'email' });
    });
    expect(await screen.findByText('No active rate limits')).toBeInTheDocument();
  });
});

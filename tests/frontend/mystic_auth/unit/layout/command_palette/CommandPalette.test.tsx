import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

const navigateMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import CommandPalette from '@/layout/command_palette/CommandPalette';

const mock = new MockAdapter(api);

const initialAuthState = useAuthStore.getState();

function seed(permissions: string[]) {
  useAuthStore.setState(initialAuthState, true);
  useAuthStore.getState().setAuthenticated(true);
  useAuthStore.getState().setProfile({
    name: 'Test User',
    email: 'user@example.com',
    role: 'user',
    permissions,
    has_password: true,
    created_at: '2026-01-15T00:00:00Z',
    active_sessions: 1,
  });
}

function renderPalette(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter>
          <CommandPalette isOpen onClose={onClose} />
        </MemoryRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
  return { ...utils, onClose };
}

describe('CommandPalette', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mock.reset();
    mock.onGet('/users/').reply(200, []);
    seed([]);
  });

  it('lists only nav items requiring no permission for a caller with none', () => {
    renderPalette();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
    expect(screen.queryByText('Users')).toBeNull();
    expect(screen.queryByText('Policies')).toBeNull();
  });

  it('includes permission-gated items once the caller holds the matching permission', () => {
    seed(['users:list_all', 'policies:read']);
    renderPalette();

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Policies')).toBeInTheDocument();
  });

  it('filters the list by the search query, case-insensitively', async () => {
    renderPalette();

    await userEvent.type(screen.getByRole('textbox'), 'dash');

    await waitFor(() => expect(screen.queryByText('Audit Log')).toBeNull());
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.queryByText('Account Settings')).toBeNull();
  });

  it('shows a no-results message when the query matches nothing', async () => {
    renderPalette();

    await userEvent.type(screen.getByRole('textbox'), 'zzzzzzzzzz');

    await waitFor(() => expect(screen.getByText('No matching results')).toBeInTheDocument());
  });

  it('navigates to the highlighted item and closes on Enter, without arrow keys', async () => {
    const { onClose } = renderPalette();

    await userEvent.type(screen.getByRole('textbox'), '{Enter}');

    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
    expect(onClose).toHaveBeenCalled();
  });

  it('moves the active selection down with ArrowDown and navigates to it on Enter', async () => {
    const { onClose } = renderPalette();

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{ArrowDown}{Enter}');

    expect(navigateMock).toHaveBeenCalledWith('/audit-log');
    expect(onClose).toHaveBeenCalled();
  });

  it('wraps back to the first item with ArrowUp from the first selection', async () => {
    const { onClose } = renderPalette();

    const input = screen.getByRole('textbox');
    // Dashboard(0) -> ArrowUp wraps to the last item, Account Settings.
    await userEvent.type(input, '{ArrowUp}{Enter}');

    expect(navigateMock).toHaveBeenCalledWith('/account-settings');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed (Dialog default close behavior)', async () => {
    const onClose = vi.fn();
    renderPalette(onClose);

    await userEvent.type(screen.getByRole('textbox'), '{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when a result is clicked', async () => {
    const onClose = vi.fn();
    renderPalette(onClose);

    await userEvent.click(screen.getByText('Dashboard'));

    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces every matching piece of page copy, not just titles, under a "Matching text" group', async () => {
    renderPalette();

    // "sessions" isn't any page's nav label, but is real copy on the
    // Dashboard's "Manage Sessions" section (dashboard.json).
    await userEvent.type(screen.getByRole('textbox'), 'sessions');

    await waitFor(() => expect(screen.getByText('Matching text')).toBeInTheDocument());
    expect(screen.getAllByText('Manage Sessions').length).toBeGreaterThan(0);
  });

  it('shows one row per distinct matching string, not one collapsed row per page', async () => {
    renderPalette();

    // "password" appears as multiple distinct strings within Account
    // Settings' Change Password tab (e.g. "Change password" and "Current
    // password"), each of which should render as its own row.
    await userEvent.type(screen.getByRole('textbox'), 'password');

    await waitFor(() => expect(screen.getAllByText('Change password').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Current password').length).toBeGreaterThan(0);
  });

  it('navigates to a matched string\'s destination when clicked', async () => {
    const { onClose } = renderPalette();

    await userEvent.type(screen.getByRole('textbox'), 'sessions');
    await waitFor(() => expect(screen.getAllByText('Manage Sessions').length).toBeGreaterThan(0));
    const [firstMatch] = screen.getAllByText('Manage Sessions');
    await userEvent.click(firstMatch);

    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('/dashboard'));
    expect(onClose).toHaveBeenCalled();
  });
});

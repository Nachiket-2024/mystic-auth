import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import UsersPage from '@/users/UsersPage';

// The per-user Policies dialog: assigning/revoking a policy, and the guard
// against revoking the caller's own policies from there. Split out of
// users_page.test.tsx once that file passed the repo's own file-length
// guideline.

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
    brand_color: null,
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

const SAMPLE_USERS = [
  {
    id: 1,
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    is_verified: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Regular User',
    email: 'user@example.com',
    role: 'user',
    is_verified: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('UsersPage Policies dialog', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('opens the Policies dialog, assigns an available policy, and revokes an assigned one', async () => {
    seed(['users:list_all', 'policies:read', 'policies:assign', 'policies:revoke']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      { id: 2, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [{ id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null }],
    });
    mock.onPost('/authorization/users/user%40example.com/policies').reply(200);
    mock.onDelete('/authorization/users/user%40example.com/policies/self_service').reply(204);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const policiesButtons = screen.getAllByRole('button', { name: 'Policies' });
    await user.click(policiesButtons[policiesButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('self_service')).toBeInTheDocument();

    // StyledSelect's visible trigger button and its hidden native <select>
    // mirror now share the same accessible name (both properly labeled via
    // Select.Label), so getByRole('combobox', ...) alone is ambiguous here
    // - selectOptions needs the real <select>, found via getByLabelText's
    // selector option instead.
    await user.selectOptions(screen.getByLabelText('Select a policy to assign', { selector: 'select' }), 'reporting');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ policy_name: 'reporting' });

    await user.click(within(dialog).getByRole('button', { name: 'Revoke self_service' }));
    // Revoking now goes through a ConfirmDialog (it strips access
    // immediately and irreversibly), matching every other destructive
    // action in the app - the click above only opens it.
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mock.history.delete.length).toBe(1));
  });

  it("disables revoke for the caller's own assigned policies in the Policies dialog", async () => {
    seed(['users:list_all', 'policies:read', 'policies:revoke'], 'admin@example.com');
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, []);
    mock.onGet('/authorization/users/admin%40example.com/policies').reply(200, {
      user_email: 'admin@example.com',
      policies: [{ id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null }],
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Admin User');
    const policiesButtons = screen.getAllByRole('button', { name: 'Policies' });
    await user.click(policiesButtons[0]);

    expect(await screen.findByText(/You cannot revoke your own policies from here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke self_service' })).toBeDisabled();
  });
});

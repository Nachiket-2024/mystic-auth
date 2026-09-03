import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import UsersPage from '@/users/UsersPage';

// The per-user Permissions dialog: direct, single-action grants that
// bypass Policy entirely (see UserPermissionsDialog.tsx). Mirrors
// users_page_policies.test.tsx's shape for its policy-dialog counterpart.

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

// The action Select's options - both action/grant tests need this stubbed
// so there's something to pick from (see permissionQueries.ts's
// usePermissionCatalogQuery, GET /authorization/permissions/catalog).
const PERMISSION_CATALOG = [
  { action: 'users:list_all', resource_type: 'users', description: "List and view any user's profile." },
  { action: 'users:read_own', resource_type: 'users', description: "Read one's own user profile." },
];

describe('UsersPage Permissions dialog', () => {
  beforeEach(() => {
    mock.reset();
  });

  // Explicit timeout: two full mutation round trips (grant, then revoke)
  // can exceed vitest's 5000ms default under the suite's full parallel run.
  it('opens the Permissions dialog, grants a direct permission, and revokes an existing one', async () => {
    seed(['users:list_all', 'permissions:read', 'permissions:grant', 'permissions:revoke']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [{ id: 1, action: 'users:read_own', resource_type: 'users', conditions: null, is_active: true, assigned_by: null }],
    });
    mock.onPost('/authorization/users/user%40example.com/permissions').reply(200);
    mock.onDelete(/\/authorization\/users\/user%40example\.com\/permissions\//).reply(200);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const permissionsButtons = screen.getAllByRole('button', { name: 'Permissions' });
    await user.click(permissionsButtons[permissionsButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    // The action Select's hidden native <option>s also contain
    // "users:read_own"; scope this to the granted-permission badge.
    expect(within(dialog).getByText(/users:read_own/, { ignore: 'option' })).toBeInTheDocument();

    // resource_type is derived automatically from the chosen action (see
    // UserPermissionsDialog's handleActionChange), not selected separately.
    await user.selectOptions(screen.getByLabelText('Select an action to grant', { selector: 'select' }), 'users:list_all');
    await user.click(within(dialog).getByRole('button', { name: 'Grant' }));
    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      action: 'users:list_all',
      resource_type: 'users',
      conditions: undefined,
    });

    await user.click(within(dialog).getByRole('button', { name: 'Revoke users:read_own' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mock.history.delete.length).toBe(1));
  });

  it("disables revoke for the caller's own direct grants in the Permissions dialog", async () => {
    seed(['users:list_all', 'permissions:read', 'permissions:revoke'], 'admin@example.com');
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    // Own row always uses the self-service /me endpoints, regardless of
    // holding permissions:read/policies:read (see UserPermissionsDialog).
    mock.onGet('/authorization/users/me/permissions').reply(200, {
      user_email: 'admin@example.com',
      permissions: [{ id: 1, action: 'users:read_own', resource_type: 'users', conditions: null, is_active: true, assigned_by: null }],
    });
    mock.onGet('/authorization/users/me/policies').reply(200, { user_email: 'admin@example.com', policies: [] });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Admin User');
    const permissionsButtons = screen.getAllByRole('button', { name: 'Permissions' });
    await user.click(permissionsButtons[0]);

    expect(await screen.findByText(/You cannot revoke your own permissions from here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke users:read_own' })).toBeDisabled();
  });

  it('excludes actions the user already holds from the grant dropdown', async () => {
    seed(['users:list_all', 'permissions:read', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [{ id: 1, action: 'users:read_own', resource_type: 'users', conditions: null, is_active: true, assigned_by: null }],
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const permissionsButtons = screen.getAllByRole('button', { name: 'Permissions' });
    await user.click(permissionsButtons[permissionsButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/users:read_own/, { ignore: 'option' });

    const actionSelect = within(dialog).getByLabelText('Select an action to grant', { selector: 'select' }) as HTMLSelectElement;
    const optionValues = Array.from(actionSelect.options).map((o) => o.value);
    // Already granted to this user - must not be offered again.
    expect(optionValues.includes('users:read_own')).toBe(false);
    // Not yet granted - still offered.
    expect(optionValues).toContain('users:list_all');
  });

  it('excludes an action already covered by an assigned policy from the grant dropdown', async () => {
    seed(['users:list_all', 'permissions:read', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [],
    });
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      // Grants users:read_own via a Policy, not a direct grant - the
      // dropdown must still exclude it.
      policies: [{ id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null }],
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const permissionsButtons = screen.getAllByRole('button', { name: 'Permissions' });
    await user.click(permissionsButtons[permissionsButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/No direct permissions granted/);

    const actionSelect = within(dialog).getByLabelText('Select an action to grant', { selector: 'select' }) as HTMLSelectElement;
    await waitFor(() => {
      const optionValues = Array.from(actionSelect.options).map((o) => o.value);
      expect(optionValues.includes('users:read_own')).toBe(false);
      expect(optionValues).toContain('users:list_all');
    });
  });

  it('rejects invalid conditions JSON before submitting a grant', async () => {
    seed(['users:list_all', 'permissions:read', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [],
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const permissionsButtons = screen.getAllByRole('button', { name: 'Permissions' });
    await user.click(permissionsButtons[permissionsButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Select an action to grant', { selector: 'select' }), 'users:list_all');
    // userEvent.type interprets `{`/`}` as special-key syntax; fireEvent
    // sidesteps that for this literal-braces JSON string.
    fireEvent.change(within(dialog).getByPlaceholderText(/Conditions JSON/), { target: { value: '{not valid json' } });
    await user.click(within(dialog).getByRole('button', { name: 'Grant' }));

    expect(await screen.findByText('Conditions must be valid JSON')).toBeInTheDocument();
    expect(mock.history.post.length).toBe(0);
  });
});

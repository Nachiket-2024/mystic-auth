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

  it('excludes a policy already fully covered by another assigned policy or a direct grant from the assign dropdown', async () => {
    seed(['users:list_all', 'policies:read', 'policies:assign']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      // Same (action, resource_type) as self_service above - fully
      // redundant once self_service is already assigned, even though its
      // own name was never assigned.
      { id: 2, name: 'read_own_duplicate', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      // Fully covered by the user's direct grant below instead of by a policy.
      { id: 3, name: 'list_all_duplicate', description: '', actions: ['users:list_all'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      // Overlaps self_service's action but also grants something new -
      // still worth offering.
      { id: 4, name: 'partial_overlap', description: '', actions: ['users:read_own', 'users:delete_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [{ id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null }],
    });
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [{ id: 1, action: 'users:list_all', resource_type: 'users', conditions: null, is_active: true, assigned_by: null }],
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const policiesButtons = screen.getAllByRole('button', { name: 'Policies' });
    await user.click(policiesButtons[policiesButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('self_service');

    const policySelect = within(dialog).getByLabelText('Select a policy to assign', { selector: 'select' }) as HTMLSelectElement;
    const optionValues = Array.from(policySelect.options).map((o) => o.value);
    expect(optionValues.includes('read_own_duplicate')).toBe(false);
    expect(optionValues.includes('list_all_duplicate')).toBe(false);
    expect(optionValues).toContain('partial_overlap');
  });

  it("disables revoke for the caller's own assigned policies in the Policies dialog", async () => {
    seed(['users:list_all', 'policies:read', 'policies:revoke'], 'admin@example.com');
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, []);
    // Own row = self-service /me endpoints, not the management ones (see
    // UserPoliciesDialog's own docstring) - regardless of holding
    // policies:read/permissions:read here, since isSelf always prefers /me.
    mock.onGet('/authorization/users/me/policies').reply(200, {
      user_email: 'admin@example.com',
      policies: [{ id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null }],
    });
    mock.onGet('/authorization/users/me/permissions').reply(200, { user_email: 'admin@example.com', permissions: [] });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Admin User');
    const policiesButtons = screen.getAllByRole('button', { name: 'Policies' });
    await user.click(policiesButtons[0]);

    expect(await screen.findByText(/You cannot revoke your own policies from here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke self_service' })).toBeDisabled();
  });

  // Carving one action out of a policy assignment (see backend's
  // policy_action_revocation_service.py): expanding a policy shows its
  // individual actions, each independently revocable without touching the
  // policy's other actions or its assignment to any other user.
  it('expands a policy to reveal its actions and revokes just one of them', async () => {
    seed(['users:list_all', 'policies:read', 'policies:revoke', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, []);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [
        {
          id: 1, name: 'reporting', description: '', actions: ['reports:view', 'reports:export'],
          resource_type: 'reports', conditions: null, is_active: true,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null,
        },
      ],
    });
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com', permissions: [],
    });
    mock.onPost('/authorization/users/user%40example.com/policies/reporting/revoke-action').reply(200);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const policiesButtons = screen.getAllByRole('button', { name: 'Policies' });
    await user.click(policiesButtons[policiesButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('reporting');

    // Actions aren't shown until expanded.
    expect(within(dialog).queryByText('reports:view')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: "Show reporting's individual actions" }));
    await within(dialog).findByText('reports:view');
    expect(within(dialog).getByText('reports:export')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Revoke reports:view from reporting' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(mock.history.post[0].url).toBe('/authorization/users/user%40example.com/policies/reporting/revoke-action');
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ action: 'reports:view' });
  });

  it('keeps multiple policies expanded independently, and Expand all/Collapse all control every one at once', async () => {
    seed(['users:list_all', 'policies:read', 'policies:revoke', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, []);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [
        {
          id: 1, name: 'reporting', description: '', actions: ['reports:view'],
          resource_type: 'reports', conditions: null, is_active: true,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null,
        },
        {
          id: 2, name: 'billing', description: '', actions: ['billing:view'],
          resource_type: 'billing', conditions: null, is_active: true,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null,
        },
      ],
    });
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com', permissions: [],
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    const policiesButtons = screen.getAllByRole('button', { name: 'Policies' });
    await user.click(policiesButtons[policiesButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('reporting');

    // Expanding "reporting" must not collapse "billing", and vice versa.
    await user.click(within(dialog).getByRole('button', { name: "Show reporting's individual actions" }));
    await within(dialog).findByText('reports:view');
    await user.click(within(dialog).getByRole('button', { name: "Show billing's individual actions" }));
    await within(dialog).findByText('billing:view');
    expect(within(dialog).getByText('reports:view')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Collapse all' }));
    expect(within(dialog).queryByText('reports:view')).toBeNull();
    expect(within(dialog).queryByText('billing:view')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Expand all' }));
    expect(within(dialog).getByText('reports:view')).toBeInTheDocument();
    expect(within(dialog).getByText('billing:view')).toBeInTheDocument();
  });
});

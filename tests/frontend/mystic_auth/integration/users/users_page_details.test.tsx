import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import UsersPage from '@/users/UsersPage';

// The per-user "View" details dialog: its own name/email/role/status/dates
// fields plus the policies/effective-permissions/direct-permissions section
// it fetches itself (see UserDetailsDialog.tsx and effectiveGrants.ts's
// buildEffectivePermissionList). Split out of users_page.test.tsx to keep
// that file focused on the table itself.

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

async function openDetailsDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await screen.findByText(name);
  const viewButtons = screen.getAllByRole('button', { name: 'View' });
  const row = screen.getByText(name).closest('tr');
  const button = row ? within(row).getByRole('button', { name: 'View' }) : viewButtons[0];
  await user.click(button);
  return screen.findByRole('dialog');
}

describe('UsersPage details dialog', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('shows the union of assigned-policy actions and direct grants as effective permissions, plus the raw direct grants separately', async () => {
    seed(['users:list_all', 'policies:read', 'permissions:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [
        { id: 1, name: 'self_service', description: '', actions: ['users:read_own'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      ],
    });
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [
        { id: 1, action: 'reports:view', resource_type: 'reports', conditions: null, is_active: true, assigned_by: null },
      ],
    });

    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetailsDialog(user, 'Regular User');

    expect(within(dialog).getByText('Regular User')).toBeInTheDocument();
    expect(within(dialog).getByText('user@example.com')).toBeInTheDocument();
    expect(within(dialog).getByText('self_service')).toBeInTheDocument();

    // Effective permissions: union of the fanned-out policy action
    // (users:read_own) and the direct grant (reports:view). reports:view
    // shows up twice overall (once under Effective, once under Direct), so
    // this only asserts the policy-derived action is present at all.
    expect(within(dialog).getByText('users:read_own')).toBeInTheDocument();
    expect(within(dialog).getAllByText('reports:view').length).toBe(2);

    // Direct permissions: the raw grant only, not the policy-derived one.
    const directHeading = within(dialog).getByText('Direct permissions');
    const directSection = directHeading.parentElement;
    expect(directSection).toBeTruthy();
    if (directSection) {
      expect(within(directSection).getByText('reports:view')).toBeInTheDocument();
      expect(within(directSection).queryByText('users:read_own')).toBeNull();
    }
  });

  it('shows empty-state copy when a user has no policies or permissions at all', async () => {
    seed(['users:list_all', 'policies:read', 'permissions:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [],
    });
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [],
    });

    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetailsDialog(user, 'Regular User');

    expect(within(dialog).getByText('No policies assigned.')).toBeInTheDocument();
    expect(within(dialog).getByText('No permissions granted.')).toBeInTheDocument();
    expect(within(dialog).getByText('No direct permissions granted.')).toBeInTheDocument();
  });

  it('shows a per-section error state when the policies request genuinely fails (not a permission restriction)', async () => {
    seed(['users:list_all', 'policies:read', 'permissions:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(500);
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [],
    });

    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetailsDialog(user, 'Regular User');

    // Only the Policies section failed - Direct permissions (whose own
    // request succeeded) still renders normally, since each section now
    // tracks its own independent loading/error state (see
    // UserDetailsDialog.tsx's AuthorizationSection).
    expect(await within(dialog).findByText("Failed to load this user's policies")).toBeInTheDocument();
    expect(within(dialog).getByText('No direct permissions granted.')).toBeInTheDocument();
  });

  it("shows a restricted-view notice (not a failed-to-load error) for a viewer who lacks policies:read, and still loads the direct permissions section", async () => {
    // e.g. an admin holding only user_administration (users:list_all),
    // neither policies:read nor permissions:read - a real, expected
    // permission restriction, not an outage, so this must read differently
    // from the genuine-failure case above.
    seed(['users:list_all', 'permissions:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/users/user%40example.com/permissions').reply(200, {
      user_email: 'user@example.com',
      permissions: [{ id: 1, action: 'reports:view', resource_type: 'reports', conditions: null, is_active: true, assigned_by: null }],
    });

    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetailsDialog(user, 'Regular User');

    expect(await within(dialog).findByText("You don't have permission to view this user's policies.")).toBeInTheDocument();
    // GET /authorization/users/{email}/policies must never fire for this
    // viewer - if it regressed and did, the unconfigured mock above (no
    // .onGet for that URL) would 404 and this would show a failed-to-load
    // error instead of the restricted-view copy asserted above. Matched by
    // the specific per-user path, not a bare "/policies" substring: this
    // page also mounts BulkPolicyAssignDialog, which independently fires
    // GET /authorization/policies (the full list, for its own dropdown)
    // regardless of whether this details dialog is even open.
    expect(mock.history.get.filter((r) => r.url?.includes('/users/user%40example.com/policies'))).toHaveLength(0);
    // permissions:read alone can't compute the union (needs policies too).
    expect(within(dialog).getByText('Viewing effective permissions requires both policies:read and permissions:read.')).toBeInTheDocument();
    // But the Direct permissions section (gated on permissions:read alone)
    // still loads normally.
    expect(within(dialog).getByText('reports:view')).toBeInTheDocument();
  });

  it('shows a restricted-view notice for the direct permissions section when the viewer lacks permissions:read', async () => {
    seed(['users:list_all', 'policies:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/users/user%40example.com/policies').reply(200, {
      user_email: 'user@example.com',
      policies: [],
    });

    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetailsDialog(user, 'Regular User');

    expect(await within(dialog).findByText("You don't have permission to view this user's direct permissions.")).toBeInTheDocument();
    // Same specific-path reasoning as the sibling test above - a bare
    // "/permissions" substring would also match the unrelated
    // /authorization/permissions/catalog fetch PolicyFormDialog-adjacent
    // dialogs on this page make independently of this details dialog.
    expect(mock.history.get.filter((r) => r.url?.includes('/users/user%40example.com/permissions'))).toHaveLength(0);
  });

  it("shows the viewer's own policies/permissions via the self-service endpoints when they open their own row, even with neither policies:read nor permissions:read", async () => {
    // e.g. an admin holding only user_administration (users:list_all) -
    // narrowly scoped, no policies:read/permissions:read at all - clicking
    // their own row in the table. GET /authorization/users/me/policies and
    // .../me/permissions are self-service (auth-only, see
    // policy_assignment_routes.py / permission_assignment_routes.py), so
    // this must never depend on those two management permissions.
    seed(['users:list_all']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/users/me/policies').reply(200, {
      user_email: 'admin@example.com',
      policies: [
        { id: 1, name: 'user_administration', description: '', actions: ['users:list_all'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      ],
    });
    mock.onGet('/authorization/users/me/permissions').reply(200, {
      user_email: 'admin@example.com',
      permissions: [],
    });

    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetailsDialog(user, 'Admin User');

    expect(await within(dialog).findByText('user_administration')).toBeInTheDocument();
    expect(within(dialog).getByText('users:list_all')).toBeInTheDocument();
    expect(within(dialog).queryByText(/don't have permission/i)).toBeNull();
    expect(within(dialog).queryByText(/requires both policies:read and permissions:read/i)).toBeNull();

    // The management (permission-gated) endpoints must never fire for
    // your own row - only the self-service /me ones above.
    expect(mock.history.get.filter((r) => r.url?.includes('/users/admin%40example.com/policies'))).toHaveLength(0);
    expect(mock.history.get.filter((r) => r.url?.includes('/users/admin%40example.com/permissions'))).toHaveLength(0);
  });
});

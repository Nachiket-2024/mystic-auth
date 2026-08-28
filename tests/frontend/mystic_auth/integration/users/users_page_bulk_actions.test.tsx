import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import UsersPage from '@/users/UsersPage';
import { Toaster } from '@/ui/toaster/toaster';
import { toaster } from '@/ui/toaster/toasterInstance';

// Multi-select (DataTable's selectable/selectedKeys/onSelectionChange,
// wired up in UsersPage.tsx) plus the three Bulk*Dialog components: fans
// one chosen policy/permission/role out across every selected user via the
// real bulk endpoints, not a client-side loop over the single-item ones.

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

function renderPage({ withToaster = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter>
          <UsersPage />
          {withToaster && <Toaster />}
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

async function selectAllRows(user: ReturnType<typeof userEvent.setup>) {
  const rowCheckboxes = await screen.findAllByRole('checkbox', { name: 'Select row' });
  for (const checkbox of rowCheckboxes) {
    await user.click(checkbox);
  }
}

describe('UsersPage bulk actions', () => {
  beforeEach(() => {
    mock.reset();
  });

  afterEach(async () => {
    // toaster is a module-level singleton that outlives each test's render
    // tree; clear it so a leftover toast from one test can't leak into the next.
    await act(async () => {
      toaster.dismiss();
    });
  });

  // Explicit timeout: passes well within vitest's 5000ms default in
  // isolation, but this suite's full parallel run occasionally pushes it
  // past that under load - same reasoning as users_page_permissions.test.tsx's
  // own identical comment on its assign+revoke roundtrip test.
  it('always renders the bulk action buttons, enabling them only once rows are selected', async () => {
    seed(['users:list_all', 'policies:assign']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    // Present but disabled with nothing selected - not hidden.
    expect(await screen.findByRole('button', { name: 'Assign / revoke policy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: 'Select row' });
    await user.click(rowCheckboxes[0]);
    // "1 selected" itself is DataTable's own built-in selection summary
    // (see DataTable.tsx), not this toolbar's concern - this only checks
    // that the bulk-action buttons enable/disable with the selection.
    expect(await screen.findByRole('button', { name: 'Assign / revoke policy' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(await screen.findByRole('button', { name: 'Assign / revoke policy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
  });

  it('bulk-assigns a policy to every selected user via the real bulk endpoint', async () => {
    seed(['users:list_all', 'policies:assign', 'policies:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onPost('/authorization/bulk/policies/assign').reply(200, {
      results: [
        { user_email: 'admin@example.com', identifier: 'reporting', status: 'success', error: null },
        { user_email: 'user@example.com', identifier: 'reporting', status: 'success', error: null },
      ],
      success_count: 2,
      error_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Select a policy to assign', { selector: 'select' }), 'reporting');
    await user.click(within(dialog).getByRole('button', { name: 'Assign to selected' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      items: [
        { user_email: 'admin@example.com', policy_name: 'reporting' },
        { user_email: 'user@example.com', policy_name: 'reporting' },
      ],
    });
    expect(await within(dialog).findByText('2 succeeded, 0 failed')).toBeInTheDocument();
  });

  it('does not still show the previous run\'s result summary when the bulk policy dialog is reopened', async () => {
    // Regression: react-query mutations keep their last `.data` around
    // across remounts until told otherwise (see BulkPolicyAssignDialog.tsx's
    // reset-on-reopen fix) - closing the dialog after a successful assign
    // and reopening it, before touching anything this time, showed the
    // exact same "succeeded" summary again.
    seed(['users:list_all', 'policies:assign', 'policies:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onPost('/authorization/bulk/policies/assign').reply(200, {
      results: [{ user_email: 'admin@example.com', identifier: 'reporting', status: 'success', error: null }],
      success_count: 1,
      error_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Select a policy to assign', { selector: 'select' }), 'reporting');
    await user.click(within(dialog).getByRole('button', { name: 'Assign to selected' }));
    expect(await within(dialog).findByText('1 succeeded, 0 failed')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));
    const reopenedDialog = await screen.findByRole('dialog');
    expect(within(reopenedDialog).queryByText('1 succeeded, 0 failed')).toBeNull();
  });

  it('surfaces a toast when the bulk-assign request itself fails (not a per-item error)', async () => {
    // Regression: the bulk-assign mutation had no onError handler at all,
    // so a request-level failure (network error, 500) left the button's
    // spinner simply stop with no feedback of any kind.
    seed(['users:list_all', 'policies:assign', 'policies:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onPost('/authorization/bulk/policies/assign').reply(500, { detail: 'bulk assign failed' });

    renderPage({ withToaster: true });
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Select a policy to assign', { selector: 'select' }), 'reporting');
    await user.click(within(dialog).getByRole('button', { name: 'Assign to selected' }));

    expect(await screen.findByText('bulk assign failed')).toBeInTheDocument();
  });

  it('excludes a policy that adds nothing the sole selected user (themselves) does not already effectively hold, from the bulk-assign dropdown', async () => {
    // Same regression as BulkPermissionGrantDialog's matching test above,
    // for policy assignment instead of a direct grant.
    seed(['users:list_all', 'policies:assign']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'user_administration', description: '', actions: ['users:list_all'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      { id: 2, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onGet('/authorization/users/me/policies').reply(200, {
      user_email: 'admin@example.com',
      policies: [
        { id: 1, name: 'user_administration', description: '', actions: ['users:list_all'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      ],
    });
    mock.onGet('/authorization/users/me/permissions').reply(200, { user_email: 'admin@example.com', permissions: [] });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Regular User');
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: 'Select row' });
    await user.click(rowCheckboxes[0]);
    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));

    const dialog = await screen.findByRole('dialog');
    const policySelect = within(dialog).getByLabelText('Select a policy to assign', { selector: 'select' });
    const optionLabels = Array.from(policySelect.querySelectorAll('option')).map((o) => o.textContent);

    expect(optionLabels).toContain('reporting');
    expect(optionLabels.includes('user_administration')).toBe(false);
  });

  it('bulk-grants a direct permission to every selected user via the real bulk endpoint', async () => {
    seed(['users:list_all', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, [
      { action: 'users:list_all', resource_type: 'users', description: "List and view any user's profile." },
    ]);
    mock.onPost('/authorization/bulk/permissions/assign').reply(200, {
      results: [
        { user_email: 'admin@example.com', identifier: 'users:list_all', status: 'success', error: null },
        { user_email: 'user@example.com', identifier: 'users:list_all', status: 'error', error: 'USER_NOT_FOUND' },
      ],
      success_count: 1,
      error_count: 1,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Grant / revoke permission' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Select an action to grant', { selector: 'select' }), 'users:list_all');
    await user.click(within(dialog).getByRole('button', { name: 'Grant to selected' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      items: [
        { user_email: 'admin@example.com', action: 'users:list_all', resource_type: 'users', conditions: undefined },
        { user_email: 'user@example.com', action: 'users:list_all', resource_type: 'users', conditions: undefined },
      ],
    });
    expect(await within(dialog).findByText('1 succeeded, 1 failed')).toBeInTheDocument();
  });

  it('does not still show the previous run\'s result summary when the bulk permission dialog is reopened', async () => {
    // Same regression as the bulk policy dialog's identical test above -
    // see BulkPermissionGrantDialog.tsx's reset-on-reopen fix.
    seed(['users:list_all', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, [
      { action: 'users:list_all', resource_type: 'users', description: "List and view any user's profile." },
    ]);
    mock.onPost('/authorization/bulk/permissions/assign').reply(200, {
      results: [{ user_email: 'admin@example.com', identifier: 'users:list_all', status: 'success', error: null }],
      success_count: 1,
      error_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Grant / revoke permission' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Select an action to grant', { selector: 'select' }), 'users:list_all');
    await user.click(within(dialog).getByRole('button', { name: 'Grant to selected' }));
    expect(await within(dialog).findByText('1 succeeded, 0 failed')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(await screen.findByRole('button', { name: 'Grant / revoke permission' }));
    const reopenedDialog = await screen.findByRole('dialog');
    expect(within(reopenedDialog).queryByText('1 succeeded, 0 failed')).toBeNull();
  });

  it('excludes an action the sole selected user (themselves) already effectively holds via a policy, from the bulk-grant dropdown', async () => {
    // Regression coverage: selecting just one row (here, the viewer's own)
    // and bulk-granting used to skip exclusion filtering entirely, letting
    // an admin "grant" themselves an action already covered by an assigned
    // policy - a redundant, duplicate direct grant that then showed up
    // under "Direct permissions" despite adding no real access. See
    // BulkPermissionGrantDialog's own docstring: exclusion only applies
    // when exactly one user is selected, using the self-service /me
    // endpoints when that one user is the viewer.
    seed(['users:list_all', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, [
      { action: 'users:list_all', resource_type: 'users', description: "List and view any user's profile." },
      { action: 'users:update_any', resource_type: 'users', description: "Update any user's profile." },
    ]);
    mock.onGet('/authorization/users/me/policies').reply(200, {
      user_email: 'admin@example.com',
      policies: [
        { id: 1, name: 'user_administration', description: '', actions: ['users:list_all'], resource_type: 'users', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
      ],
    });
    mock.onGet('/authorization/users/me/permissions').reply(200, { user_email: 'admin@example.com', permissions: [] });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Regular User');
    // Select only the admin's own row (Admin User = admin@example.com,
    // the seeded viewer), not both rows - the single-selection case this
    // test exercises.
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: 'Select row' });
    await user.click(rowCheckboxes[0]);
    await user.click(await screen.findByRole('button', { name: 'Grant / revoke permission' }));

    const dialog = await screen.findByRole('dialog');
    const actionSelect = within(dialog).getByLabelText('Select an action to grant', { selector: 'select' });
    const optionLabels = Array.from(actionSelect.querySelectorAll('option')).map((o) => o.textContent);

    expect(optionLabels).toContain('users:update_any');
    expect(optionLabels.includes('users:list_all')).toBe(false);
  });

  it('shows "already had this" for a bulk-assign item the backend reports as a no-op', async () => {
    // status: "already_held" (see bulk_schema.py's BulkItemResult) is a
    // genuine no-op the backend reports separately from "success" - the
    // picker itself never filters out policies/permissions some selected
    // users already have (that's ambiguous across a multi-user selection),
    // so this after-the-fact per-user annotation is the only place that
    // distinction surfaces.
    seed(['users:list_all', 'policies:assign', 'policies:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);
    mock.onPost('/authorization/bulk/policies/assign').reply(200, {
      results: [
        { user_email: 'admin@example.com', identifier: 'reporting', status: 'success', error: null },
        { user_email: 'user@example.com', identifier: 'reporting', status: 'already_held', error: null },
      ],
      success_count: 2,
      error_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Select a policy to assign', { selector: 'select' }), 'reporting');
    await user.click(within(dialog).getByRole('button', { name: 'Assign to selected' }));

    expect(await within(dialog).findByText('2 succeeded, 0 failed')).toBeInTheDocument();
    expect(within(dialog).getByText('already had this')).toBeInTheDocument();
  });

  it('bulk-sets the role for every selected user via the real bulk endpoint', async () => {
    seed(['users:list_all', 'users:assign_role']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onPost('/authorization/bulk/users/role').reply(200, {
      results: [
        { user_email: 'admin@example.com', identifier: 'admin', status: 'success', error: null },
        { user_email: 'user@example.com', identifier: 'admin', status: 'success', error: null },
      ],
      success_count: 2,
      error_count: 0,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Set role' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Select a role to set', { selector: 'select' }), 'admin');
    await user.click(within(dialog).getByRole('button', { name: 'Set role for selected' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      items: [
        { user_email: 'admin@example.com', role: 'admin' },
        { user_email: 'user@example.com', role: 'admin' },
      ],
    });
    expect(await within(dialog).findByText('2 succeeded, 0 failed')).toBeInTheDocument();
  });

  it('hides "Remove from selected" in the bulk policy dialog when the caller lacks policies:revoke', async () => {
    // Regression coverage: the toolbar's own "Assign / revoke policy" button is
    // correctly gated on policies:assign (see BulkActionToolbar.tsx), but
    // the dialog it opens also renders a destructive "Remove from
    // selected" action of its own, which must independently gate on
    // policies:revoke - holding assign alone must never surface a control
    // whose backend call (bulk/policies/remove) this caller can't actually
    // make.
    seed(['users:list_all', 'policies:assign', 'policies:read']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/policies').reply(200, [
      { id: 1, name: 'reporting', description: '', actions: ['reports:view'], resource_type: 'reports', conditions: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: null },
    ]);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Assign / revoke policy' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Assign to selected' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remove from selected' })).toBeNull();
  });

  it('hides "Revoke from selected" in the bulk permission dialog when the caller lacks permissions:revoke', async () => {
    // Same regression as the policy dialog's identical test above, for the
    // direct-permission bulk dialog's own "Revoke from selected" action.
    seed(['users:list_all', 'permissions:grant']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);
    mock.onGet('/authorization/permissions/catalog').reply(200, [
      { action: 'users:list_all', resource_type: 'users', description: "List and view any user's profile." },
    ]);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');
    await selectAllRows(user);
    await user.click(await screen.findByRole('button', { name: 'Grant / revoke permission' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Grant to selected' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Revoke from selected' })).toBeNull();
  });

  it('only selects rows by clicking their content once "Select mode" is turned on', async () => {
    seed(['users:list_all', 'policies:assign']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Regular User');

    // Off by default: clicking a row's plain text must not select it (it
    // would otherwise fight double-click/drag-select-to-copy on cell text).
    await user.click(screen.getByText('Regular User'));
    expect(screen.getByRole('button', { name: 'Assign / revoke policy' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select mode' }));
    await user.click(screen.getByText('Regular User'));
    expect(await screen.findByRole('button', { name: 'Assign / revoke policy' })).toBeEnabled();
  });
});

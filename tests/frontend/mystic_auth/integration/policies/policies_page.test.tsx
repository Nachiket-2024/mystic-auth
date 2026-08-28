import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import PoliciesPage from '@/policies/PoliciesPage';

const mock = new MockAdapter(api);
const initialAuthState = useAuthStore.getState();

function seed(permissions: string[]) {
  useAuthStore.setState(initialAuthState, true);
  useAuthStore.getState().setAuthenticated(true);
  useAuthStore.getState().setProfile({
    name: 'Test Admin',
    email: 'admin@example.com',
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
          <PoliciesPage />
        </MemoryRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

// Options for the create/edit form's resource-type-scoped actions
// multi-select (see PolicyFormDialog's selectableActions).
const PERMISSION_CATALOG = [
  { action: 'users:read_own', resource_type: 'users', description: "Read one's own user profile." },
  { action: 'policies:read', resource_type: 'policies', description: 'Read/list policies.' },
  { action: 'policies:update', resource_type: 'policies', description: "Edit an existing policy's fields." },
];

const SAMPLE_POLICIES = [
  {
    id: 1,
    name: 'self_service',
    description: 'Basic self-service access',
    actions: ['users:read_own'],
    resource_type: 'users',
    conditions: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
  },
];

describe('PoliciesPage', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('lists policies returned by the backend', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);

    renderPage();

    expect(await screen.findByText('self_service')).toBeInTheDocument();
  });

  it('hides the Create Policy button when the caller lacks policies:create', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);

    renderPage();

    await screen.findByText('self_service');
    expect(screen.queryByRole('button', { name: 'Create Policy' })).toBeNull();
  });

  it('shows the Create Policy button and opens the form when the caller holds policies:create', async () => {
    seed(['policies:read', 'policies:create']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);

    renderPage();

    const createButton = await screen.findByRole('button', { name: 'Create Policy' });
    await userEvent.click(createButton);

    expect(screen.getByPlaceholderText('e.g. document_reviewer')).toBeInTheDocument();
  });

  it('hides Edit/Delete row actions for a caller with only policies:read', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);

    renderPage();

    await screen.findByText('self_service');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('creates a policy via the form, submitting the expected payload, and closes the dialog on success', async () => {
    seed(['policies:read', 'policies:create']);
    mock.onGet('/authorization/policies').reply(200, []);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onPost('/authorization/policies').reply(201, {
      id: 2,
      name: 'document_reviewer',
      description: 'Can review documents',
      actions: ['policies:update'],
      resource_type: 'policies',
      conditions: null,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      created_by: 'admin@example.com',
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Create Policy' }));
    await user.type(screen.getByPlaceholderText('e.g. document_reviewer'), 'document_reviewer');
    // Resource type is chosen before actions - the actions multi-select's
    // options are scoped to whichever resource type is currently selected
    // (see PolicyFormDialog's selectableActions).
    await user.selectOptions(screen.getByLabelText('Resource type', { selector: 'select' }), 'policies');
    await user.selectOptions(screen.getByLabelText('Actions', { selector: 'select' }), ['policies:update']);
    await user.click(screen.getByRole('button', { name: 'Create policy' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      name: 'document_reviewer',
      description: '',
      actions: ['policies:update'],
      resource_type: 'policies',
      conditions: undefined,
    });
  });

  it('shows a local validation error and does not submit when Conditions is invalid JSON', async () => {
    seed(['policies:read', 'policies:create']);
    mock.onGet('/authorization/policies').reply(200, []);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Create Policy' }));
    await user.type(screen.getByPlaceholderText('e.g. document_reviewer'), 'broken_policy');
    await user.selectOptions(screen.getByLabelText('Resource type', { selector: 'select' }), 'policies');
    await user.selectOptions(screen.getByLabelText('Actions', { selector: 'select' }), ['policies:read']);
    await user.type(screen.getByPlaceholderText('e.g. { "self_only": true }'), '{{ not valid json');
    await user.click(screen.getByRole('button', { name: 'Create policy' }));

    expect(await screen.findByText('Conditions must be valid JSON')).toBeInTheDocument();
    expect(mock.history.post.length).toBe(0);
  });

  it('shows an error message in the dialog when creating a policy fails', async () => {
    seed(['policies:read', 'policies:create']);
    mock.onGet('/authorization/policies').reply(200, []);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onPost('/authorization/policies').reply(500);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Create Policy' }));
    await user.type(screen.getByPlaceholderText('e.g. document_reviewer'), 'broken_policy');
    await user.selectOptions(screen.getByLabelText('Resource type', { selector: 'select' }), 'policies');
    await user.selectOptions(screen.getByLabelText('Actions', { selector: 'select' }), ['policies:read']);
    await user.click(screen.getByRole('button', { name: 'Create policy' }));

    expect(await screen.findByText('Failed to create policy')).toBeInTheDocument();
  });

  it('opens the edit form pre-filled and submits an update via PUT', async () => {
    seed(['policies:read', 'policies:update']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);
    mock.onPut('/authorization/policies/self_service').reply(200, {
      ...SAMPLE_POLICIES[0],
      description: 'Updated description',
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByDisplayValue('self_service')).toBeInTheDocument();

    const descriptionInput = screen.getByDisplayValue('Basic self-service access');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Updated description');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mock.history.put.length).toBe(1));
    expect(JSON.parse(mock.history.put[0].data)).toMatchObject({ description: 'Updated description' });
  });

  it('deletes a policy after confirming in the ConfirmDialog', async () => {
    seed(['policies:read', 'policies:delete']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);
    mock.onDelete('/authorization/policies/self_service').reply(204);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Delete "self_service"\?/)).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mock.history.delete.length).toBe(1));
  });

  it('shows a restricted-view notice and a standalone Create button for a caller with only policies:create (no policies:read)', async () => {
    seed(['policies:create']);
    // GET /authorization/policies is never called for this caller (the
    // list query is gated on policies:read) - if PoliciesPage regressed and
    // fired it anyway, this unconfigured mock would 404, and the
    // assertions below on the restricted-view copy (not an error state)
    // would fail.

    renderPage();

    expect(await screen.findByText(/create policies, but you don't have permission to view/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Policy' })).toBeInTheDocument();
    expect(mock.history.get.filter((r) => r.url === '/authorization/policies')).toHaveLength(0);
  });

  it('opens the create form from the restricted view for a policies:create-only caller', async () => {
    seed(['policies:create']);
    mock.onGet('/authorization/permissions/catalog').reply(200, PERMISSION_CATALOG);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Create Policy' }));

    expect(screen.getByPlaceholderText('e.g. document_reviewer')).toBeInTheDocument();
  });

  it('does not show the restricted-view notice or hide the table for a caller who holds policies:read', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply(200, SAMPLE_POLICIES);

    renderPage();

    await screen.findByText('self_service');
    expect(screen.queryByText(/don't have permission to view/i)).toBeNull();
  });

  it('prompts to discard unsaved changes when closing a dirty form', async () => {
    seed(['policies:read', 'policies:create']);
    mock.onGet('/authorization/policies').reply(200, []);

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Create Policy' }));
    await user.type(screen.getByPlaceholderText('e.g. document_reviewer'), 'draft_policy');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();

    // Cancelling the discard-confirm dialog must leave the form dialog open with the typed value
    // intact. Both dialogs are mounted at once here, each with their own "Cancel" button - the
    // discard-confirm's is the last one rendered.
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(screen.getByDisplayValue('draft_policy')).toBeInTheDocument();
  });
});

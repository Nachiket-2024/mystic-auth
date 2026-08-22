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

// Pagination, server-side search/filter/sort. Row actions (create/edit/
// delete) are covered in policies_page.test.tsx - split out the same way
// users_page_list_controls.test.tsx is split from users_page.test.tsx.

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
  {
    id: 2,
    name: 'policy_administration',
    description: 'Manage policies',
    actions: ['policies:read'],
    resource_type: 'policies',
    conditions: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
  },
];

describe('PoliciesPage list controls', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('shows numbered pages (from X-Total-Count) and fetches the next page on click', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply((config) => {
      const offset = Number(config.params?.offset ?? 0);
      if (offset === 0) {
        return [200, SAMPLE_POLICIES, { 'x-total-count': '30' }];
      }
      return [
        200,
        [{ ...SAMPLE_POLICIES[0], id: 3, name: 'page_two_policy' }],
        { 'x-total-count': '30' },
      ];
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('policy_administration');
    // 30 policies / 25 per page = 2 pages, so page buttons should render.
    const page2Buttons = screen.getAllByRole('button', { name: 'Page 2' });
    expect(page2Buttons.length).toBeGreaterThan(0);

    await user.click(page2Buttons[0]);

    expect(await screen.findByText('page_two_policy')).toBeInTheDocument();
    const getRequests = mock.history.get.filter((r) => r.url === '/authorization/policies');
    expect(getRequests[getRequests.length - 1].params).toMatchObject({ offset: 25 });
  });

  it('searches server-side (debounced) and resets to page 1', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply((config) => {
      if (config.params?.search === 'administration') {
        return [200, [SAMPLE_POLICIES[1]], { 'x-total-count': '1' }];
      }
      return [200, SAMPLE_POLICIES, { 'x-total-count': '2' }];
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('self_service');
    await user.type(screen.getByPlaceholderText('Search by name or description...'), 'administration');

    // Debounced: the filtered result (and the self_service row disappearing)
    // shouldn't show up until after the debounce window.
    await waitFor(() => expect(screen.queryByText('self_service')).toBeNull(), { timeout: 2000 });
    expect(screen.getByText('policy_administration')).toBeInTheDocument();

    const lastRequest = mock.history.get[mock.history.get.length - 1];
    expect(lastRequest.params).toMatchObject({ search: 'administration' });
  });

  it('filters by resource type via the select and resets to page 1', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply((config) => {
      if (config.params?.resource_type === 'policies') {
        return [200, [SAMPLE_POLICIES[1]], { 'x-total-count': '1' }];
      }
      return [200, SAMPLE_POLICIES, { 'x-total-count': '2' }];
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('self_service');
    await user.selectOptions(
      screen.getByLabelText('Filter by resource type', { selector: 'select' }),
      'policies'
    );

    await waitFor(() => expect(screen.queryByText('self_service')).toBeNull());
    expect(screen.getByText('policy_administration')).toBeInTheDocument();

    const lastRequest = mock.history.get[mock.history.get.length - 1];
    expect(lastRequest.params).toMatchObject({ resource_type: 'policies' });
  });

  it('filters by status via the select and resets to page 1', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply((config) => {
      if (config.params?.is_active === false) {
        return [200, [], { 'x-total-count': '0' }];
      }
      return [200, SAMPLE_POLICIES, { 'x-total-count': '2' }];
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('self_service');
    await user.selectOptions(screen.getByLabelText('Filter by status', { selector: 'select' }), 'false');

    await waitFor(() => expect(screen.queryByText('self_service')).toBeNull());
    expect(await screen.findByText('No policies match these filters')).toBeInTheDocument();

    const lastRequest = mock.history.get[mock.history.get.length - 1];
    expect(lastRequest.params).toMatchObject({ is_active: false });
  });

  it('sorts by clicking the Name column header, toggling direction on a second click', async () => {
    seed(['policies:read']);
    mock.onGet('/authorization/policies').reply((config) => {
      const sortDir = config.params?.sort_dir;
      const sortBy = config.params?.sort_by;
      if (sortBy === 'name' && sortDir === 'asc') {
        return [200, [SAMPLE_POLICIES[0]], { 'x-total-count': '2' }];
      }
      if (sortBy === 'name' && sortDir === 'desc') {
        return [200, [SAMPLE_POLICIES[1]], { 'x-total-count': '2' }];
      }
      return [200, SAMPLE_POLICIES, { 'x-total-count': '2' }];
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('self_service');
    await user.click(screen.getByText('Name'));

    await waitFor(() => {
      const lastRequest = mock.history.get[mock.history.get.length - 1];
      expect(lastRequest.params).toMatchObject({ sort_by: 'name', sort_dir: 'asc' });
    });

    await user.click(screen.getByText('Name'));

    await waitFor(() => {
      const lastRequest = mock.history.get[mock.history.get.length - 1];
      expect(lastRequest.params).toMatchObject({ sort_by: 'name', sort_dir: 'desc' });
    });
  });
});

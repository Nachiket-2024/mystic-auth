import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
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
});

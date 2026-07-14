import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import UsersPage from '@/users_admin/UsersPage';

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

describe('UsersPage', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('lists users returned by the backend', async () => {
    seed(['users:list_all']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);

    renderPage();

    expect(await screen.findByText('Regular User')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('hides Delete/Promote row actions when the caller lacks those permissions', async () => {
    seed(['users:list_all']);
    mock.onGet('/users/').reply(200, SAMPLE_USERS);

    renderPage();

    await screen.findByText('Regular User');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Promote' })).toBeNull();
  });

  it('disables the delete button for the caller\'s own row even with users:delete_any', async () => {
    seed(['users:list_all', 'users:delete_any'], 'admin@example.com');
    mock.onGet('/users/').reply(200, SAMPLE_USERS);

    renderPage();

    await screen.findByText('Admin User');
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    // First row is the admin (self) — must be disabled to prevent self-deletion
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).toBeEnabled();
  });
});

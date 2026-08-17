import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import ConfirmDeleteAccountPage from '@/account_settings/confirm_delete/ConfirmDeleteAccountPage';
import { useAuthStore } from '@/store/authStore';

const mock = new MockAdapter(api);
const initialAuthState = useAuthStore.getState();

function renderAtToken(search: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter initialEntries={[`/confirm-delete${search}`]}>
          <Routes>
            <Route path="/confirm-delete" element={<ConfirmDeleteAccountPage />} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

describe('ConfirmDeleteAccountPage', () => {
  beforeEach(() => {
    mock.reset();
    useAuthStore.setState(initialAuthState, true);
  });

  it('disables the confirm button when the URL has no token', () => {
    renderAtToken('');

    expect(screen.getByRole('button', { name: 'Confirm Account Deletion' })).toBeDisabled();
  });

  it('confirms deletion and redirects to login on success', async () => {
    mock.onPost('/users/me/confirm-delete', { token: 'delete-token-abc' }).reply(200, {
      message: 'Your account has been deleted',
    });

    renderAtToken('?token=delete-token-abc');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Confirm Account Deletion' }));

    await screen.findByText('Login page');
    expect(mock.history.post.length).toBe(1);
  });

  it('shows an error message and leaves the button re-clickable when confirmation fails', async () => {
    mock.onPost('/users/me/confirm-delete').reply(400, { error: 'Invalid or expired token' });

    renderAtToken('?token=stale-token');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Confirm Account Deletion' }));

    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(await screen.findByText(/invalid or expired token/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Account Deletion' })).toBeEnabled();
  });
});

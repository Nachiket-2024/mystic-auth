import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import PasswordResetConfirmForm from '@/auth/password_reset_confirm/PasswordResetConfirmForm';

// Regression guard for the "Redis outage failure modes are inconsistent"
// fix: a genuinely successful reset (sessions_revoked: false) must show a
// distinct warning, not the plain success message, so the account's
// unrevoked other sessions aren't invisible to the user.
const mock = new MockAdapter(api);

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <PasswordResetConfirmForm token="valid-token" />
      </ChakraProvider>
    </QueryClientProvider>
  );
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('New password'), 'NewStrongPass456!');
  await user.type(screen.getByLabelText('Confirm new password'), 'NewStrongPass456!');
  await user.click(screen.getByRole('button', { name: 'Reset Password' }));
}

describe('PasswordResetConfirmForm', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('shows the plain success message when sessions_revoked is true', async () => {
    mock.onPost('/auth/password-reset/confirm').reply(200, {
      message: 'Password has been reset successfully',
      sessions_revoked: true,
    });

    renderForm();
    await submit(userEvent.setup());

    expect(await screen.findByText('Password has been reset successfully')).toBeInTheDocument();
  });

  it('shows a distinct warning when sessions_revoked is false', async () => {
    mock.onPost('/auth/password-reset/confirm').reply(200, {
      message: 'Password has been reset successfully',
      sessions_revoked: false,
    });

    renderForm();
    await submit(userEvent.setup());

    expect(
      await screen.findByText("Your password was reset, but we couldn't sign out your other sessions. Log in and check Manage Sessions.")
    ).toBeInTheDocument();
    expect(screen.queryByText('Password has been reset successfully')).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import PasswordResetRequestForm from '@/auth/password_reset_request/PasswordResetRequestForm';

const mock = new MockAdapter(api);

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <PasswordResetRequestForm />
      </ChakraProvider>
    </QueryClientProvider>
  );
}

async function submit(user: ReturnType<typeof userEvent.setup>, email = 'user@example.com') {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.click(screen.getByRole('button', { name: 'Request Password Reset' }));
}

describe('PasswordResetRequestForm', () => {
  beforeEach(() => {
    mock.reset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the success message once the request resolves', async () => {
    mock.onPost('/auth/password-reset/request').reply(200, {
      message: 'If that email exists, a reset link has been sent',
    });

    renderForm();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await submit(user);

    expect(await screen.findByText('If that email exists, a reset link has been sent')).toBeInTheDocument();
  });

  it('shows the error message when the request fails', async () => {
    mock.onPost('/auth/password-reset/request').reply(500, { detail: 'Something went wrong' });

    renderForm();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await submit(user);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('If that email exists, a reset link has been sent')).toBeNull();
  });

  it('starts a cooldown after submit and disables resubmission until it elapses', async () => {
    mock.onPost('/auth/password-reset/request').reply(200, { message: 'sent' });

    renderForm();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await submit(user);
    await screen.findByText('sent');

    expect(mock.history.post).toHaveLength(1);

    // Button shows a "try again in Ns" countdown; clicking during cooldown must not re-fire.
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mock.history.post).toHaveLength(1);
  });
});

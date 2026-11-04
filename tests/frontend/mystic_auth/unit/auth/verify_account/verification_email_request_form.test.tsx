import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import VerificationEmailRequestForm from '@/auth/verify_account/VerificationEmailRequestForm';

const mock = new MockAdapter(api);

function renderForm(emailKnown = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
        <VerificationEmailRequestForm initialEmail="user@example.com" emailKnown={emailKnown} />
    </QueryClientProvider>
  );
}

describe('VerificationEmailRequestForm', () => {
  beforeEach(() => {
    mock.reset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the email field when the address is already known, and still resends to it', async () => {
    let sent = '';
    mock.onPost('/auth/verify-account/request').reply((config) => {
      sent = JSON.parse(config.data).email;
      return [200, { message: 'Verification email sent' }];
    });

    renderForm(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));

    await screen.findByText('Verification email sent');
    expect(sent).toBe('user@example.com');
  });

  it('shows the email field by default (verify page, where the user typed nothing yet)', () => {
    renderForm();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('starts a cooldown after a successful resend', async () => {
    mock.onPost('/auth/verify-account/request').reply(200, { message: 'Verification email sent' });

    renderForm();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));

    await screen.findByText('Verification email sent');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  // Regression: same fix as PasswordResetRequestForm - the cooldown used to
  // start on click regardless of the response, so a 429 showed a "try again
  // in Ns" countdown on the button while the alert said to try later.
  it('does not start a cooldown when the resend fails', async () => {
    mock.onPost('/auth/verify-account/request').reply(429, { detail: 'Please try again later' });

    renderForm();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(await screen.findByText('Please try again later')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Resend verification email' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    await user.click(button);
    expect(mock.history.post).toHaveLength(2);
  });
});

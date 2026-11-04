import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import SignupPage from '@/auth/signup/SignupPage';

const mock = new MockAdapter(api);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// After a successful signup the card should show only the "check your email"
// result. The create-account header, terms line, Google button and "already
// have an account" link all describe a form that is no longer there.
describe('SignupPage after a successful signup', () => {
  beforeEach(() => mock.reset());

  it('drops the sign-up-only content and keeps only the result', async () => {
    mock.onPost('/auth/signup').reply(200, { message: 'sent' });
    renderPage();
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name/i), 'Test User');
    await user.type(screen.getByLabelText(/^email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Password1x');
    await user.type(screen.getByLabelText(/confirm password/i), 'Password1x');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));

    await screen.findByText('Check your email');
    expect(screen.queryByRole('heading', { name: 'Create your account' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Terms of Service' })).toBeNull();
    expect(screen.queryByText(/already have an account/i)).toBeNull();
    // the way back stays available
    expect(screen.getByRole('link', { name: 'Back to log in' })).toBeInTheDocument();
  });
});

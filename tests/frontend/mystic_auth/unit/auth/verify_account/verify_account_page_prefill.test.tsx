import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import VerifyAccountPage from '@/auth/verify_account/VerifyAccountPage';

function renderAt(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <VerifyAccountPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The verification email puts token and email in the URL fragment. The email
// only prefills the resend field; nothing is decided from it client-side.
describe('VerifyAccountPage resend field', () => {
  it('is prefilled with the address from the link', () => {
    renderAt('/verify-account#token=abc&email=a%2Bb%40example.com');
    expect(screen.getByRole('textbox')).toHaveValue('a+b@example.com');
  });

  it('stays empty when the page is opened without a link', () => {
    renderAt('/verify-account');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

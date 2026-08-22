import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import SignupForm from '@/auth/signup/SignupForm';

// Regression guard for the signup legal-consent line added alongside the
// Privacy Policy/Terms of Service pages: previously there was no
// consent/legal-link UI anywhere in the signup flow.
describe('SignupForm legal consent line', () => {
  it('links to both the Terms of Service and Privacy Policy pages', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ChakraProvider value={defaultSystem}>
          <MemoryRouter>
            <SignupForm />
          </MemoryRouter>
        </ChakraProvider>
      </QueryClientProvider>
    );

    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});

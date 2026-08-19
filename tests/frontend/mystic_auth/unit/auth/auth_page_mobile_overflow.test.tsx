// Regression: LoginPage/SignupPage/PasswordResetRequestPage/
// PasswordResetConfirmPage/VerifyAccountPage's Card used to render with a
// fixed pixel `w` (e.g. w="400px"), which overflowed a 375px viewport
// (the card itself is wider than the screen, forcing horizontal scroll).
// The fix made every one of these Cards use w="full" maxW="<n>px" instead,
// so the card shrinks to the viewport and only caps its growth on wide
// screens. These tests pin that a fixed-pixel `w` doesn't come back.
import type { ReactElement } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import LoginPage from '@/auth/login/LoginPage';
import SignupPage from '@/auth/signup/SignupPage';
import PasswordResetRequestPage from '@/auth/password_reset_request/PasswordResetRequestPage';
import PasswordResetConfirmPage from '@/auth/password_reset_confirm/PasswordResetConfirmPage';
import VerifyAccountPage from '@/auth/verify_account/VerifyAccountPage';

function renderPage(ui: ReactElement, initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

// Chakra/Panda resolves a token width like w="full" to a CSS custom
// property reference (var(--chakra-sizes-full)); a fixed pixel width like
// the old bug would instead resolve to a literal "<n>px" string. Asserting
// against that literal-px shape (rather than the exact token) is what
// actually catches a regression back to a hardcoded pixel width.
function expectNonFixedPixelWidth(container: HTMLElement) {
  const card = container.querySelector('.chakra-card__root') as HTMLElement | null;
  expect(card).toBeInstanceOf(HTMLElement);
  const width = getComputedStyle(card!).width;
  expect(/^\d+px$/.test(width)).toBe(false);
}

describe('auth page Cards no longer use a fixed pixel width (mobile-overflow regression)', () => {
  it('LoginPage', () => {
    const { container } = renderPage(<LoginPage />);
    expectNonFixedPixelWidth(container);
  });

  it('SignupPage', () => {
    const { container } = renderPage(<SignupPage />);
    expectNonFixedPixelWidth(container);
  });

  it('SignupPage stacks the Name/Email row as a single column at the base (mobile) breakpoint', () => {
    // Previously a fixed-direction HStack, which is what forced the wide
    // Card in the first place; direction={{ base: "column", sm: "row" }}
    // is what lets a narrow Card actually fit the fields.
    const { container } = renderPage(<SignupPage />);
    const nameInput = container.querySelector('input[placeholder="Enter your name"]') as HTMLElement;
    const row = nameInput.closest('.chakra-stack') as HTMLElement;
    expect(getComputedStyle(row).flexDirection).toBe('column');
  });

  it('PasswordResetRequestPage', () => {
    const { container } = renderPage(<PasswordResetRequestPage />);
    expectNonFixedPixelWidth(container);
  });

  it('PasswordResetConfirmPage', () => {
    const { container } = renderPage(<PasswordResetConfirmPage />, ['/password-reset-confirm?token=abc']);
    expectNonFixedPixelWidth(container);
  });

  it('VerifyAccountPage', () => {
    const { container } = renderPage(<VerifyAccountPage />, ['/verify-account?token=abc&email=user%40example.com']);
    expectNonFixedPixelWidth(container);
  });
});

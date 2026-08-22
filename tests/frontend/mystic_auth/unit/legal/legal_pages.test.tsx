import type { ReactElement } from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter, Routes, Route } from 'react-router';

import i18next from 'i18next';

import { useAuthStore } from '@/store/authStore';
import PrivacyPolicyPage from '@/legal/PrivacyPolicyPage';
import TermsOfServicePage from '@/legal/TermsOfServicePage';

const initialAuthState = useAuthStore.getState();

function renderPage(ui: ReactElement) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ChakraProvider>
  );
}

describe('PrivacyPolicyPage', () => {
  it('renders the policy heading and back buttons (top and bottom)', () => {
    renderPage(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { name: /Privacy Policy/i })).toBeInTheDocument();
    // Buttons, not links: the back action navigates to wherever the visitor
    // came from (browser history), not a fixed href - see
    // LegalDocumentLayout's BackButton docstring.
    const backButtons = screen.getAllByRole('button', { name: /Back/i });
    expect(backButtons).toHaveLength(2);
  });

  it('discloses the actual data collected (session IPs and audit log retention)', () => {
    // Regression guard: these two facts are easy to accidentally drop if the
    // content is ever rewritten, and both were flagged specifically during
    // the data-inventory review this policy was written against.
    renderPage(<PrivacyPolicyPage />);
    expect(screen.getByText(/IP address and user agent/i)).toBeInTheDocument();
    expect(screen.getByText(/does not delete your prior log entries/i)).toBeInTheDocument();
  });
});

describe('TermsOfServicePage', () => {
  it('renders the terms heading and back buttons (top and bottom)', () => {
    renderPage(<TermsOfServicePage />);
    expect(screen.getByRole('heading', { name: /Terms of Service/i })).toBeInTheDocument();
    const backButtons = screen.getAllByRole('button', { name: /Back/i });
    expect(backButtons).toHaveLength(2);
  });
});

describe('Back button navigation', () => {
  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
  });

  it('returns to the page the visitor actually came from, not always the landing page', async () => {
    const user = userEvent.setup();
    render(
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter initialEntries={['/account-settings', '/privacy']} initialIndex={1}>
          <Routes>
            <Route path="/account-settings" element={<div>Account Settings Page</div>} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );

    await user.click(screen.getAllByRole('button', { name: /Back/i })[0]);
    expect(screen.getByText('Account Settings Page')).toBeInTheDocument();
  });

  it('falls back to /dashboard for a signed-in visitor landing directly on the document (no history)', async () => {
    useAuthStore.getState().setAuthenticated(true);
    const user = userEvent.setup();
    render(
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter initialEntries={['/privacy']}>
          <Routes>
            <Route path="/dashboard" element={<div>Dashboard Page</div>} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );

    await user.click(screen.getAllByRole('button', { name: /Back/i })[0]);
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('falls back to the landing page for an unauthenticated visitor landing directly on the document', async () => {
    const user = userEvent.setup();
    render(
      <ChakraProvider value={defaultSystem}>
        <MemoryRouter initialEntries={['/terms']}>
          <Routes>
            <Route path="/" element={<div>Landing Page</div>} />
            <Route path="/terms" element={<TermsOfServicePage />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );

    await user.click(screen.getAllByRole('button', { name: /Back/i })[0]);
    expect(screen.getByText('Landing Page')).toBeInTheDocument();
  });
});

describe('legal pages in every supported language', () => {
  // Regression guard for the {{appName}}/{{contactPlaceholder}}/
  // {{entityPlaceholder}} interpolation in translations/languages/*/legal.json:
  // a missing key or a typo'd token would leave a raw "{{...}}" in the
  // rendered page instead of throwing, so this has to be asserted, not
  // assumed.
  const languages = ['en', 'hi', 'mr', 'gu'] as const;

  afterEach(() => {
    i18next.changeLanguage('en');
  });

  // Phrased as a positive "matches nothing" equality check, not
  // `.not.toMatch()` - see docs/mystic_auth/testing/overview.md's ".not
  // chaining" note on why this repo avoids that chain.
  it.each(languages)('renders %s with no unresolved interpolation placeholders', async (lang) => {
    await i18next.changeLanguage(lang);
    const { container: privacyContainer } = renderPage(<PrivacyPolicyPage />);
    expect(privacyContainer.textContent?.match(/{{\s*\w+\s*}}/)).toBeNull();

    const { container: termsContainer } = renderPage(<TermsOfServicePage />);
    expect(termsContainer.textContent?.match(/{{\s*\w+\s*}}/)).toBeNull();
  });
});

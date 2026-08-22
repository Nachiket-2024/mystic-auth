// Regression: the OAuth2 callback redirects back to /login with a
// `?error=<code>` query param on failure (see backend
// oauth2_login_handler.py's _redirect_to_login_clearing_state), but nothing
// in the frontend used to read it - OAuth2LoginButton hardcoded `error={null}`,
// so a user (e.g. a soft-deleted account trying "Sign in with Google") landed
// back on /login with no explanation at all. These tests pin that the param
// is read, translated, displayed, and stripped from the URL afterward.
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';

import OAuth2LoginButton from '@/auth/oauth2/OAuth2LoginButton';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/login"
            element={
              <>
                <OAuth2LoginButton />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>
  );
}

describe('OAuth2LoginButton', () => {
  it('translates a known ?error= code from the OAuth2 redirect and displays it', async () => {
    renderAt('/login?error=ACCOUNT_DELETED');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This account has been deleted');
    });
  });

  it('strips the error param from the URL after reading it', async () => {
    renderAt('/login?error=ACCOUNT_DEACTIVATED');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location-search')).toHaveTextContent('');
  });

  it('renders no alert when there is no error param', () => {
    renderAt('/login');

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

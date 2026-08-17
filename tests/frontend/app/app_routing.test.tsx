import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import App from '@app/App';
import { useAuthStore } from '@/store/authStore';

// App.tsx builds its own BrowserRouter internally (rather than accepting one
// from the caller), so the route under test is set via the real browser
// history before each render instead of a MemoryRouter wrapper.
function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <App />
      </ChakraProvider>
    </QueryClientProvider>
  );
}

const mock = new MockAdapter(api);
const initialAuthState = useAuthStore.getState();

describe('App routing', () => {
  beforeEach(() => {
    mock.reset();
    useAuthStore.setState(initialAuthState, true);
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the public login page without requiring a session check to resolve favorably', async () => {
    mock.onGet('/auth/me').reply(401);
    renderAppAt('/login');

    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor away from a protected route, to /login', async () => {
    mock.onGet('/auth/me').reply(401);
    renderAppAt('/dashboard');

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('renders the dashboard for an authenticated visitor', async () => {
    mock.onGet('/auth/me').reply(200, {
      name: 'Test User',
      email: 'user@example.com',
      role: 'user',
      permissions: [],
    });
    renderAppAt('/dashboard');

    // "Manage Sessions" (not a page title) is the landmark here: the
    // Dashboard's own welcome banner is a compact identity/stats/actions
    // row with no unique static heading of its own, unlike this card.
    // Dashboard is a lazily code-split route (see trackedLazy.ts), so its
    // first render here also pays for a real dynamic import; that's slow
    // enough under coverage instrumentation to occasionally miss the
    // default 1000ms findBy* timeout, hence the explicit longer one.
    expect(await screen.findByText('Manage Sessions', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('redirects an authenticated visitor from / to /dashboard, updating the URL', async () => {
    mock.onGet('/auth/me').reply(200, {
      name: 'Test User',
      email: 'user@example.com',
      role: 'user',
      permissions: [],
    });
    renderAppAt('/');

    // "Manage Sessions" (not a page title) is the landmark here: the
    // Dashboard's own welcome banner is a compact identity/stats/actions
    // row with no unique static heading of its own, unlike this card.
    // Dashboard is a lazily code-split route (see trackedLazy.ts), so its
    // first render here also pays for a real dynamic import; that's slow
    // enough under coverage instrumentation to occasionally miss the
    // default 1000ms findBy* timeout, hence the explicit longer one.
    expect(await screen.findByText('Manage Sessions', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('shows an unauthenticated visitor the landing page at /, not a redirect', async () => {
    mock.onGet('/auth/me').reply(401);
    renderAppAt('/');

    // The landing page (app/landing_page/LandingPage.tsx) itself, not an
    // auto-redirect to /login: it's a pre-auth marketing page whose own
    // CTAs link into /login and /signup, so it should stay on / until the
    // visitor actually clicks one.
    expect(await screen.findByRole('link', { name: 'Get started' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('sends an authenticated visitor without the required permission to /not-authorized', async () => {
    mock.onGet('/auth/me').reply(200, {
      name: 'Test User',
      email: 'user@example.com',
      role: 'user',
      permissions: [], // lacks users:list_all
    });
    renderAppAt('/users');

    expect(await screen.findByText("You don't have permission to view this page")).toBeInTheDocument();
  });

  it('renders a 404 page for an unknown route', async () => {
    mock.onGet('/auth/me').reply(401);
    renderAppAt('/this-route-does-not-exist');

    expect(await screen.findByText('Oops! Page Not Found')).toBeInTheDocument();
  });
});

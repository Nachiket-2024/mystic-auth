import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';

const webauthn = vi.hoisted(() => ({
  supported: true,
  startAuthentication: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => webauthn.supported,
  startAuthentication: webauthn.startAuthentication,
}));

import api from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import LoginForm from '@/auth/login/LoginForm';

const mock = new MockAdapter(api);
const initialAuthState = useAuthStore.getState();

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('passkey sign-in', () => {
  beforeEach(() => {
    mock.reset();
    vi.clearAllMocks();
    webauthn.supported = true;
    useAuthStore.setState(initialAuthState, true);
  });

  it('completes browser authentication, fetches the profile, and authenticates the app', async () => {
    const options = {
      challenge: 'challenge-value',
      timeout: 60000,
      rpId: 'example.test',
      userVerification: 'required',
      allowCredentials: [],
    };
    const credential = {
      id: 'credential-id',
      rawId: 'credential-id',
      type: 'public-key',
      response: { clientDataJSON: 'client-data', authenticatorData: 'auth-data', signature: 'signature' },
    };
    const profile = {
      name: 'Passkey User',
      email: 'user@example.com',
      role: 'user',
      permissions: [],
    };
    webauthn.startAuthentication.mockResolvedValue(credential);
    mock.onPost('/auth/passkeys/authentication/options').reply(200, options);
    mock.onPost('/auth/passkeys/authentication/verify', credential).reply(200, { detail: 'Signed in' });
    mock.onGet('/auth/me').reply(200, profile);

    const onSuccess = vi.fn();
    renderWithProviders(<LoginForm onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(webauthn.startAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
    expect(mock.history.post.map((request) => request.url)).toEqual([
      '/auth/passkeys/authentication/options',
      '/auth/passkeys/authentication/verify',
    ]);
    expect(mock.history.post[1].data).toBe(JSON.stringify(credential));
    expect(mock.history.get.some((request) => request.url === '/auth/me')).toBe(true);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().email).toBe(profile.email);
  });

  it('keeps passkey sign-in unavailable when the browser lacks WebAuthn', () => {
    webauthn.supported = false;

    renderWithProviders(<LoginForm />);

    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).not.toBeInTheDocument();
  });
});

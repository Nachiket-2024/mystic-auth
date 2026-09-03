import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';

// Mocked so these tests exercise ErrorBoundary's catch-and-render behavior
// without depending on the real Sentry SDK. reportError has its own
// coverage in core/errorMonitoring.test.ts.
vi.mock('@/core/errorMonitoring', () => ({
  reportError: vi.fn(),
}));

import ErrorBoundary from '@/ui/routing/ErrorBoundary';
import { reportError } from '@/core/errorMonitoring';

const Bomb: React.FC = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // restoreAllMocks only clears vi.spyOn spies, not a vi.mock() factory's
    // vi.fn(), so call counts would otherwise accumulate across tests.
    vi.mocked(reportError).mockClear();
  });

  it('renders children normally when nothing below it throws', () => {
    render(
      <ChakraProvider value={defaultSystem}>
        <ErrorBoundary>
          <div>Everything is fine</div>
        </ErrorBoundary>
      </ChakraProvider>
    );

    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });

  it('renders the fallback instead of crashing the whole tree when a child throws during render', () => {
    // React also logs the error to console on its own; silenced here so
    // test output stays readable. The assertions below prove the catch.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ChakraProvider value={defaultSystem}>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </ChakraProvider>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    // .not.toBeInTheDocument() doesn't type-check here; toBeNull() on
    // queryByText's result is the equivalent (see docs/mystic_auth/testing/overview.md).
    expect(screen.queryByText('Everything is fine')).toBeNull();
  });

  it('offers a reload action in the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ChakraProvider value={defaultSystem}>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </ChakraProvider>
    );

    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('reports the caught error for error monitoring', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ChakraProvider value={defaultSystem}>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </ChakraProvider>
    );

    expect(reportError).toHaveBeenCalledOnce();
    const [reportedError] = vi.mocked(reportError).mock.calls[0];
    expect((reportedError as Error).message).toBe('boom');
  });
});

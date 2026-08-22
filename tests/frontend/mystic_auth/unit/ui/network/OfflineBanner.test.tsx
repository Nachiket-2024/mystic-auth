import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';

import { useNetworkStatusStore } from '@/store/networkStatusStore';
import OfflineBanner from '@/ui/network/OfflineBanner';

function renderBanner() {
  return render(
    <ChakraProvider value={defaultSystem}>
      <OfflineBanner />
    </ChakraProvider>
  );
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    useNetworkStatusStore.setState({ isOnline: true });
  });

  it('renders nothing on a page that loads already online', () => {
    renderBanner();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the offline warning once the store reports offline', () => {
    useNetworkStatusStore.setState({ isOnline: false });

    renderBanner();

    expect(screen.getByRole('status')).toHaveTextContent(
      "You're offline. Some features may not work until your connection is restored."
    );
  });

  it('hides the offline warning again once the store reports online with no prior offline stretch', () => {
    renderBanner();

    act(() => useNetworkStatusStore.setState({ isOnline: false }));
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);

    act(() => useNetworkStatusStore.setState({ isOnline: true }));
    // A real reconnect (as opposed to a page loading already online) always
    // earns the brief "back online" confirmation below - covered by its own
    // test - so this one only asserts the offline warning itself is gone.
    expect(screen.queryByText("You're offline. Some features may not work until your connection is restored.")).toBeNull();
  });

  it('shows a "back online" confirmation once connectivity returns, then hides it again', () => {
    vi.useFakeTimers();
    try {
      useNetworkStatusStore.setState({ isOnline: false });
      renderBanner();
      expect(screen.getByRole('status')).toHaveTextContent(/offline/i);

      act(() => {
        useNetworkStatusStore.setState({ isOnline: true });
      });
      expect(screen.getByRole('status')).toHaveTextContent("You're back online.");

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

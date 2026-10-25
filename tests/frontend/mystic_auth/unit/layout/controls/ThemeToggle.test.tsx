import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useThemeStore } from '@/store/themeStore';
import ThemeToggle from '@/layout/controls/ThemeToggle';

const initialThemeState = useThemeStore.getState();

function renderToggle() {
  return render(<ThemeToggle />);
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    useThemeStore.setState(initialThemeState, true);
  });

  it('labels itself "switch to dark mode" while in light mode', () => {
    useThemeStore.setState({ colorMode: 'light' });
    renderToggle();

    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('labels itself "switch to light mode" while in dark mode', () => {
    useThemeStore.setState({ colorMode: 'dark' });
    renderToggle();

    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('toggles the store color mode on click', async () => {
    useThemeStore.setState({ colorMode: 'light' });
    renderToggle();

    await userEvent.click(screen.getByRole('button'));

    expect(useThemeStore.getState().colorMode).toBe('dark');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import SkipLink, { MAIN_CONTENT_ID } from '@/layout/SkipLink';
import RouteTitleAnnouncer from '@/layout/RouteTitleAnnouncer';

describe('SkipLink', () => {
  afterEach(() => cleanup());

  it('points at the main content id', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(`#${MAIN_CONTENT_ID}`);
  });
});

describe('RouteTitleAnnouncer', () => {
  afterEach(() => cleanup());

  it('sets the tab title from the page h1', async () => {
    render(
      <MemoryRouter>
        <RouteTitleAnnouncer />
        <h1>Users</h1>
      </MemoryRouter>
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.title.startsWith('Users')).toBe(true);
  });

  it('exposes a polite status region', () => {
    const { container } = render(<MemoryRouter><RouteTitleAnnouncer /></MemoryRouter>);
    const region = container.querySelector('[role="status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });
});

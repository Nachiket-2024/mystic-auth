import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import type { ManagedUserRead } from '@/api/users_api';
import UserPasskeysDialog from '@/users/dialogs/UserPasskeysDialog';

const mock = new MockAdapter(api);

const target = { id: 5, name: 'Target', email: 'target@example.com', role: 'user' } as ManagedUserRead;
const LIST = '/users/target%40example.com/passkeys';

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UserPasskeysDialog user={target} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('UserPasskeysDialog', () => {
  beforeEach(() => {
    mock.reset();
    mock.onGet(LIST).reply(200, [
      { id: 1, name: 'Laptop', created_at: '2026-01-01T00:00:00Z', last_used_at: '2026-02-01T00:00:00Z' },
      { id: 2, name: 'Phone', created_at: '2026-01-05T00:00:00Z', last_used_at: null },
    ]);
  });

  it('lists the passkeys by name with no credential material and marks unused ones', async () => {
    renderDialog();

    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText(/Never used/)).toBeInTheDocument();
  });

  it('asks for confirmation, then removes only the chosen passkey', async () => {
    mock.onDelete(`${LIST}/2`).reply(200, { detail: 'Passkeys removed', removed: 1 });
    renderDialog();
    const user = userEvent.setup();

    await screen.findByText('Phone');
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(mock.history.delete).toHaveLength(0);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
    expect(mock.history.delete[0].url).toBe(`${LIST}/2`);
  });

  it('removes every passkey after confirmation', async () => {
    mock.onDelete(LIST).reply(200, { detail: 'Passkeys removed', removed: 2 });
    renderDialog();
    const user = userEvent.setup();

    await screen.findByText('Laptop');
    await user.click(screen.getByRole('button', { name: 'Remove all' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove all' }));

    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
    expect(mock.history.delete[0].url).toBe(LIST);
  });

  it('shows an empty state and disables Remove all when there are none', async () => {
    mock.onGet(LIST).reply(200, []);
    renderDialog();

    expect(await screen.findByText('This user has no passkeys.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove all' })).toBeDisabled();
  });

  it('shows an error when the list cannot be loaded', async () => {
    mock.onGet(LIST).reply(403, { detail: 'Forbidden' });
    renderDialog();

    expect(await screen.findByText('Could not load passkeys.')).toBeInTheDocument();
  });
});

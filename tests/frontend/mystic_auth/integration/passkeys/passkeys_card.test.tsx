import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';

import api from '@/api/axiosInstance';
import PasskeysCard from '@/passkeys/PasskeysCard';

const mock = new MockAdapter(api);

function renderCard(hasPassword = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><PasskeysCard hasPassword={hasPassword} /></QueryClientProvider>);
}

describe('PasskeysCard', () => {
  beforeEach(() => {
    mock.reset();
    mock.onGet('/auth/passkeys').reply(200, [{
      id: 7,
      name: 'Personal laptop',
      created_at: '2026-01-01T00:00:00Z',
      last_used_at: '2026-02-01T00:00:00Z',
    }]);
  });

  it('lists the registered count and last-used activity', async () => {
    renderCard();

    expect(await screen.findByDisplayValue('Personal laptop')).toBeInTheDocument();
    expect(screen.getByText('1 passkey registered')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Last used' })).toBeInTheDocument();
  });

  // Layout guard (jsdom cannot measure widths, so this pins the classes): the card fills the
  // tab like the Active Sessions table, and the name field is capped instead of stretching
  // across the whole name column.
  it('fills the tab width and keeps the name field a normal size', async () => {
    const { container } = renderCard();
    const field = await screen.findByDisplayValue('Personal laptop');

    expect(container.querySelector('.w-full.p-5')).not.toBeNull();
    expect(container.querySelector('.max-w-5xl')).toBeNull();
    expect(field.closest('.max-w-sm')).not.toBeNull();
  });

  it('renames only the selected account credential and refreshes the list', async () => {
    mock.onPatch('/auth/passkeys/7').reply(200, { detail: 'Passkey renamed' });
    renderCard();
    const user = userEvent.setup();

    const field = await screen.findByDisplayValue('Personal laptop');
    await user.clear(field);
    await user.type(field, 'Work laptop{Enter}');

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(mock.history.patch[0].data).toBe(JSON.stringify({ name: 'Work laptop' }));
  });

  it('requires confirmation before removing a passkey', async () => {
    mock.onDelete('/auth/passkeys/7').reply(200, { detail: 'Passkey removed' });
    renderCard();
    const user = userEvent.setup();

    await screen.findByDisplayValue('Personal laptop');
    await user.click(screen.getByRole('button', { name: 'Remove Personal laptop' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mock.history.delete).toHaveLength(0);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
  });

  it('asks for the password when the server requires confirmation, then retries the removal', async () => {
    let attempts = 0;
    mock.onDelete('/auth/passkeys/7').reply(() => {
      attempts += 1;
      return attempts === 1
        ? [403, { detail: 'Confirm', code: 'PASSKEY_STEP_UP_REQUIRED', params: {} }]
        : [200, { detail: 'Passkey removed' }];
    });
    mock.onPost('/auth/passkeys/step-up/password').reply(200, { detail: 'Confirmed', expires_in: 900 });
    renderCard();
    const user = userEvent.setup();

    await screen.findByDisplayValue('Personal laptop');
    await user.click(screen.getByRole('button', { name: 'Remove Personal laptop' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Account password'), 'secret-pw');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mock.history.delete).toHaveLength(2));
    expect(mock.history.post[0].url).toBe('/auth/passkeys/step-up/password');
    expect(mock.history.post[0].data).toBe(JSON.stringify({ password: 'secret-pw' }));
  });

  it('shows the server error and does not retry when the password is wrong', async () => {
    mock.onDelete('/auth/passkeys/7').reply(403, { detail: 'Confirm', code: 'PASSKEY_STEP_UP_REQUIRED', params: {} });
    mock.onPost('/auth/passkeys/step-up/password').reply(400, { detail: 'bad', code: 'CURRENT_PASSWORD_INCORRECT', params: {} });
    renderCard();
    const user = userEvent.setup();

    await screen.findByDisplayValue('Personal laptop');
    await user.click(screen.getByRole('button', { name: 'Remove Personal laptop' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Account password'), 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await within(dialog).findByText('Current password is incorrect')).toBeInTheDocument();
    expect(mock.history.delete).toHaveLength(1);
  });

  it('offers Google confirmation, not a password field, for accounts without a password', async () => {
    mock.onDelete('/auth/passkeys/7').reply(403, { detail: 'Confirm', code: 'PASSKEY_STEP_UP_REQUIRED', params: {} });
    renderCard(false);
    const user = userEvent.setup();

    await screen.findByDisplayValue('Personal laptop');
    await user.click(screen.getByRole('button', { name: 'Remove Personal laptop' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Account password')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('reports the result when Google sends the user back and clears the URL', async () => {
    window.history.replaceState({}, '', '/account-settings?tab=passkeys&stepup=ok');
    renderCard();

    await screen.findByDisplayValue('Personal laptop');
    await waitFor(() => expect(window.location.search).toBe('?tab=passkeys'));
  });

  describe('bulk removal', () => {
    beforeEach(() => {
      mock.onGet('/auth/passkeys').reply(200, [
        { id: 7, name: 'Personal laptop', created_at: '2026-01-01T00:00:00Z', last_used_at: null },
        { id: 8, name: 'Phone', created_at: '2026-01-02T00:00:00Z', last_used_at: null },
        { id: 9, name: 'Security key', created_at: '2026-01-03T00:00:00Z', last_used_at: null },
      ]);
      mock.onPost('/auth/passkeys/bulk-remove').reply(200, { detail: 'Passkeys removed', removed: 2 });
    });

    it('removes only the selected passkeys after confirmation', async () => {
      renderCard();
      const user = userEvent.setup();

      await screen.findByDisplayValue('Phone');
      expect(screen.getByRole('button', { name: 'Remove selected' })).toBeDisabled();
      const boxes = screen.getAllByRole('checkbox'); // [select all, row 7, row 8, row 9]
      await user.click(boxes[1]);
      await user.click(boxes[2]);
      expect(screen.getByText('2 selected')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove selected' }));
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove selected' }));

      await waitFor(() => expect(mock.history.post).toHaveLength(1));
      expect(mock.history.post[0].url).toBe('/auth/passkeys/bulk-remove');
      expect(JSON.parse(mock.history.post[0].data)).toEqual({ ids: [7, 8] });
    });

    it('removes everything with Remove all after confirmation', async () => {
      renderCard();
      const user = userEvent.setup();

      await screen.findByDisplayValue('Phone');
      await user.click(screen.getByRole('button', { name: 'Remove all' }));
      expect(mock.history.post).toHaveLength(0);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove all' }));

      await waitFor(() => expect(mock.history.post).toHaveLength(1));
      expect(JSON.parse(mock.history.post[0].data)).toEqual({ all: true });
    });

    it('asks for confirmation of identity first when the server requires it, then retries', async () => {
      let attempts = 0;
      mock.onPost('/auth/passkeys/bulk-remove').reply(() => {
        attempts += 1;
        return attempts === 1
          ? [403, { detail: 'Confirm', code: 'PASSKEY_STEP_UP_REQUIRED', params: {} }]
          : [200, { detail: 'Passkeys removed', removed: 3 }];
      });
      mock.onPost('/auth/passkeys/step-up/password').reply(200, { detail: 'Confirmed', expires_in: 900 });
      renderCard();
      const user = userEvent.setup();

      await screen.findByDisplayValue('Phone');
      await user.click(screen.getByRole('button', { name: 'Remove all' }));
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove all' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Account password'), 'secret-pw');
      await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(attempts).toBe(2));
    });
  });

  it('saves on blur, reverts on Escape, and ignores unchanged or empty names', async () => {
    mock.onPatch('/auth/passkeys/7').reply(200, { detail: 'Passkey renamed' });
    renderCard();
    const user = userEvent.setup();

    const field = await screen.findByDisplayValue('Personal laptop');
    await user.click(field);
    await user.tab(); // unchanged: no request
    await user.clear(field);
    await user.tab(); // empty: no request, name restored
    expect(field).toHaveValue('Personal laptop');
    await user.type(field, ' typo{Escape}');
    expect(field).toHaveValue('Personal laptop');
    await user.tab();
    expect(mock.history.patch).toHaveLength(0);

    await user.clear(field);
    await user.type(field, 'Desk');
    await user.tab(); // blur saves
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ name: 'Desk' });
  });
});

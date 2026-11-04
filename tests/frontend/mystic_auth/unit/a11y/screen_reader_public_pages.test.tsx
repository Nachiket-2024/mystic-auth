import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import MockAdapter from 'axios-mock-adapter';
import { virtual } from '@guidepup/virtual-screen-reader';

import api from '@/api/axiosInstance';
import LoginPage from '@/auth/login/LoginPage';
import SignupPage from '@/auth/signup/SignupPage';
import PasswordResetRequestPage from '@/auth/password_reset_request/PasswordResetRequestPage';
import VerifyAccountPage from '@/auth/verify_account/VerifyAccountPage';
import PrivacyPolicyPage from '@app/legal/PrivacyPolicyPage';
import TermsOfServicePage from '@app/legal/TermsOfServicePage';

// A virtual screen reader (Guidepup) walks the rendered page in reading order and returns what a
// real one would announce. It cannot replace NVDA/VoiceOver on a device, but it catches the
// structural mistakes that make real readers useless: no heading to jump to, skipped heading
// levels, controls announced without a name, no main landmark.
async function readPage(ui: ReactElement, url = '/'): Promise<string[]> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
  await virtual.start({ container });
  const phrases: string[] = [];
  for (let i = 0; i < 600; i++) {
    await virtual.next();
    const phrase = await virtual.lastSpokenPhrase();
    if (phrase === 'end of document' || (phrases.length > 3 && phrase === phrases[0])) break;
    phrases.push(phrase);
  }
  await virtual.stop();
  return phrases;
}

const headingLevels = (phrases: string[]) =>
  phrases.flatMap((p) => { const m = /^heading, .*, level (\d)$/.exec(p); return m ? [Number(m[1])] : []; });

const UNNAMED = /^(button|link|textbox|combobox|checkbox|radio|switch|tab|menuitem|searchbox|spinbutton)(,\s*)?$/;

const PAGES: Array<[string, () => ReactElement, string?]> = [
  ['login', () => <LoginPage />],
  ['signup', () => <SignupPage />],
  ['password reset request', () => <PasswordResetRequestPage />],
  ['verify account', () => <VerifyAccountPage />],
  ['privacy policy', () => <PrivacyPolicyPage />],
  ['terms of service', () => <TermsOfServicePage />],
];

describe('public pages read correctly with a screen reader', () => {
  afterEach(() => cleanup());

  it.each(PAGES)('%s: one h1, no skipped levels, one main landmark, no unnamed controls', async (_name, page, url) => {
    const phrases = await readPage(page(), url);
    const levels = headingLevels(phrases);

    expect(levels.filter((l) => l === 1), 'exactly one h1').toHaveLength(1);
    expect(levels[0], 'first heading is the h1').toBe(1);
    levels.slice(1).forEach((level, i) => expect(level - levels[i], 'no skipped heading level').toBeLessThanOrEqual(1));
    expect(phrases.filter((p) => p === 'main'), 'one main landmark').toHaveLength(1);
    expect(phrases.filter((p) => UNNAMED.test(p)), 'controls announced without a name').toEqual([]);
  });

  it('every text field is announced with its label', async () => {
    const phrases = await readPage(<SignupPage />);
    for (const label of ['Name', 'Email']) {
      expect(phrases.some((p) => p.startsWith(`textbox, ${label}`)), `${label} field`).toBe(true);
    }
    expect(phrases.some((p) => /^textbox, Email.*required/.test(p)), 'required is announced').toBe(true);
  });
});

describe('signup result is announced and focused', () => {
  const mock = new MockAdapter(api);
  beforeEach(() => mock.reset());
  afterEach(() => cleanup());

  it('shows a heading for the result and moves focus to it', async () => {
    mock.onPost('/auth/signup').reply(200, { message: 'sent' });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={queryClient}><MemoryRouter><SignupPage /></MemoryRouter></QueryClientProvider>);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^name/i), 'Test User');
    await user.type(screen.getByLabelText(/^email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'Password1x');
    await user.type(screen.getByLabelText(/confirm password/i), 'Password1x');
    await user.click(screen.getByRole('button', { name: /create account|sign up/i }));

    const heading = await screen.findByRole('heading', { name: 'Check your email', level: 1 });
    expect(document.activeElement).toBe(heading);

    await virtual.start({ container });
    const phrases: string[] = [];
    for (let i = 0; i < 80; i++) {
      await virtual.next();
      const phrase = await virtual.lastSpokenPhrase();
      if (phrase === 'end of document' || (phrases.length > 3 && phrase === phrases[0])) break;
      phrases.push(phrase);
    }
    await virtual.stop();
    expect(headingLevels(phrases)).toEqual([1]);
    expect(phrases.filter((p) => UNNAMED.test(p))).toEqual([]);
  });
});

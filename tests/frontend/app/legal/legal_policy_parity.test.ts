import { describe, expect, it } from 'vitest';

import en from '@/translations/languages/en/legal.json';
import gu from '@/translations/languages/gu/legal.json';
import hi from '@/translations/languages/hi/legal.json';
import mr from '@/translations/languages/mr/legal.json';

const LANGUAGES = { en, hi, mr, gu } as const;

// The translated policies had fallen behind the English one (they still said "two cookies" and
// described error monitoring as self-hosted only). Structure and the technical facts must match
// in every language; the prose itself is for a native speaker to review.
describe('privacy policy and terms stay in step across languages', () => {
  it.each(Object.keys(LANGUAGES))('%s has the same sections and paragraph counts as English', (code) => {
    const doc = LANGUAGES[code as keyof typeof LANGUAGES];
    expect(doc.privacy.sections.map((s) => s.paragraphs.length)).toEqual(en.privacy.sections.map((s) => s.paragraphs.length));
    expect(doc.terms.sections.map((s) => s.paragraphs.length)).toEqual(en.terms.sections.map((s) => s.paragraphs.length));
  });

  it.each(Object.keys(LANGUAGES))('%s names every cookie and the monitoring services the code really uses', (code) => {
    const text = JSON.stringify(LANGUAGES[code as keyof typeof LANGUAGES].privacy);
    for (const fact of ['access_token', 'refresh_token', 'oauth_state', 'SameSite=Strict', 'SENTRY_DSN', 'Bugsink', 'MaxMind', 'ntfy']) {
      expect(text, `${code} privacy policy is missing "${fact}"`).toContain(fact);
    }
  });
});

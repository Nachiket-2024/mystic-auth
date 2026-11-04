import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest always runs from frontend/ (mounted at /app in the dev container, where
// tests/frontend is mounted separately), so resolve from the working directory.
const APP_DIR = resolve(process.cwd(), 'src/app');

// sdk.ts is upstream's export list; app_sdk.ts is the app's own place to import anything it
// exposes. App.tsx and main.tsx are the shared entry points, and the translation
// registrations load upstream's JSON bundles. Everything else in app/ goes through sdk/app_sdk.
const MAY_IMPORT_MYSTIC_AUTH = [/^sdk\.ts$/, /^app_sdk\.ts$/, /^App\.tsx$/, /^main\.tsx$/, /^translations\//];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('frontend/src/app import boundary', () => {
  it('only the allowed files import from mystic_auth directly', () => {
    const offenders = sourceFiles(APP_DIR)
      .map((file) => relative(APP_DIR, file))
      .filter((rel) => !MAY_IMPORT_MYSTIC_AUTH.some((pattern) => pattern.test(rel)))
      .filter((rel) => /from\s+['"][^'"]*\/mystic_auth\//.test(readFileSync(join(APP_DIR, rel), 'utf-8')));
    expect(offenders).toEqual([]);
  });
});

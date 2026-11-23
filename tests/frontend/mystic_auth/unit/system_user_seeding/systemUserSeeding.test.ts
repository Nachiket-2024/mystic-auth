import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ageBrowserSessions,
  deleteBrowserSystemUser,
  seedBrowserPasskeyRows,
  seedBrowserSystemUser,
} from '../../e2e/support/systemUserSeeding';

const email = 'user@example.com';
const helpers: Array<[string, () => void]> = [
  ['seedBrowserSystemUser', () => seedBrowserSystemUser(email)],
  ['deleteBrowserSystemUser', () => deleteBrowserSystemUser(email)],
  ['ageBrowserSessions', () => ageBrowserSessions(email, 20)],
  ['seedBrowserPasskeyRows', () => seedBrowserPasskeyRows(email, 2)],
];

// Uses a real child process against a temp PATH holding a fake `docker`
// (or none), so the real ENOENT/exit-code behavior is exercised.
describe('systemUserSeeding docker handling', () => {
  const originalPath = process.env.PATH;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fake-docker-'));
    process.env.PATH = dir;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  });

  function fakeDocker(body: string) {
    const file = join(dir, 'docker');
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  }

  function caught(run: () => void): Error {
    try {
      run();
    } catch (error) {
      return error as Error;
    }
    throw new Error('expected the helper to throw');
  }

  it.each(helpers)('%s names the missing docker CLI', (_name, run) => {
    const error = caught(run);
    expect(error.message).toMatch(/docker CLI was not found.*docker-cli/s);
    expect((error.cause as NodeJS.ErrnoException).code).toBe('ENOENT');
  });

  it.each(helpers)('%s rethrows other docker failures unchanged', (_name, run) => {
    fakeDocker('exit 3');
    const error = caught(run);
    expect(error.message).not.toMatch(/docker CLI was not found/);
    expect((error as Error & { status: number }).status).toBe(3);
  });

  it.each(helpers)('%s runs docker compose exec when docker works', (_name, run) => {
    const log = join(dir, 'args');
    fakeDocker(`echo "$@" > "${log}"`);
    run();
    expect(readFileSync(log, 'utf8')).toMatch(/compose.* exec /);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const NONCE = '0123456789abcdef0123456789abcdef';

function setMeta(content: string | null) {
  document.head.querySelectorAll('meta[name="csp-nonce"]').forEach((el) => el.remove());
  if (content !== null) {
    const meta = document.createElement('meta');
    meta.name = 'csp-nonce';
    meta.content = content;
    document.head.append(meta);
  }
}

async function load() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('@/core/cspNonce');
}

describe('cspNonce', () => {
  beforeEach(() => {
    delete (window as unknown as { __webpack_nonce__?: string }).__webpack_nonce__;
  });
  afterEach(() => setMeta(null));

  it('exposes the nonce nginx stamped into the page and publishes it for get-nonce', async () => {
    setMeta(NONCE);
    const { cspNonce } = await load();
    expect(cspNonce).toBe(NONCE);
    expect((window as unknown as { __webpack_nonce__?: string }).__webpack_nonce__).toBe(NONCE);
  });

  it('treats the unreplaced placeholder (dev server, tests) as no nonce', async () => {
    setMeta('__CSP_NONCE__');
    const { cspNonce } = await load();
    expect(cspNonce).toBeUndefined();
    expect((window as unknown as { __webpack_nonce__?: string }).__webpack_nonce__).toBeUndefined();
  });

  it('treats a missing or empty meta tag as no nonce', async () => {
    setMeta(null);
    expect((await load()).cspNonce).toBeUndefined();
    setMeta('');
    expect((await load()).cspNonce).toBeUndefined();
  });
});

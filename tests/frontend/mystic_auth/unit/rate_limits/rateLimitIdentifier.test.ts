import { describe, expect, it } from 'vitest';
import { describeIdentifier } from '@/rate_limits/rateLimitIdentifier';

const DIGEST = '8f5bad3a5998d1934915d69f02dd6b1c8d3e7a40f1c2b9a64e5d7c8b9a0f1e2d';

describe('describeIdentifier', () => {
  it('shows an IP address as it is', () => {
    expect(describeIdentifier({ identifier: '203.0.113.5' })).toEqual({ text: '203.0.113.5', full: '203.0.113.5', isDigest: false });
  });

  it('prefers the server-supplied label over the digest', () => {
    expect(describeIdentifier({ identifier: DIGEST, identifier_label: 'wei.zhang@example.com' })).toEqual({
      text: 'wei.zhang@example.com',
      full: 'wei.zhang@example.com',
      isDigest: false,
    });
  });

  it('shortens an unmatched digest and keeps the full value', () => {
    expect(describeIdentifier({ identifier: DIGEST, identifier_label: null })).toEqual({
      text: `${DIGEST.slice(0, 12)}…`,
      full: DIGEST,
      isDigest: true,
    });
  });

  it('does not treat an ordinary identifier that merely looks long as a digest', () => {
    expect(describeIdentifier({ identifier: 'abc123' }).isDigest).toBe(false);
  });
});

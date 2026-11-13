import { fingerprintToken, issueOpaqueToken } from './token-fingerprint';

describe('opaque token fingerprints', () => {
  it('issues unpredictable bearer material and stores only a one-way fingerprint', () => {
    const first = issueOpaqueToken();
    const second = issueOpaqueToken();

    expect(first.token).not.toBe(second.token);
    expect(first.token).toHaveLength(43);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fingerprint).toBe(fingerprintToken(first.token));
    expect(first.fingerprint).not.toBe(first.token);
  });
});

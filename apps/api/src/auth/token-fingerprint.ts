import { createHash, randomBytes } from 'node:crypto';

export interface IssuedOpaqueToken {
  token: string;
  fingerprint: string;
}

export function issueOpaqueToken(): IssuedOpaqueToken {
  const token = randomBytes(32).toString('base64url');
  return { token, fingerprint: fingerprintToken(token) };
}

export function fingerprintToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

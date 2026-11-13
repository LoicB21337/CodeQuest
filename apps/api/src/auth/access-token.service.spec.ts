import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const originalSecret = process.env.ACCESS_TOKEN_SECRET;

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = 'test-secret-with-at-least-thirty-two-bytes';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.ACCESS_TOKEN_SECRET;
    } else {
      process.env.ACCESS_TOKEN_SECRET = originalSecret;
    }
  });

  it('issues a short-lived signed token and rejects tampering or expiry', () => {
    const service = new AccessTokenService();
    const now = Date.parse('2026-11-13T12:00:00.000Z');
    const issued = service.issue(
      '550e8400-e29b-41d4-a716-446655440000',
      '660e8400-e29b-41d4-a716-446655440000',
      now,
    );

    expect(service.verify(issued.token, now)).toMatchObject({
      sub: '550e8400-e29b-41d4-a716-446655440000',
      sid: '660e8400-e29b-41d4-a716-446655440000',
      exp: Math.floor(now / 1000) + 900,
    });
    expect(service.verify(`${issued.token}x`, now)).toBeUndefined();
    expect(service.verify(issued.token, now + 15 * 60 * 1000)).toBeUndefined();
  });
});

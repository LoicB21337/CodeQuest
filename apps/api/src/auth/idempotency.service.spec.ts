import { ConflictException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const originalSecret = process.env.AUTH_FINGERPRINT_SECRET;
  const secret = 'idempotency-test-secret-at-least-thirty-two-bytes';
  const key = '123e4567-e89b-42d3-a456-426614174000';
  const payload = '{"email":"person@example.test","password":"private"}';

  beforeEach(() => {
    process.env.AUTH_FINGERPRINT_SECRET = secret;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_FINGERPRINT_SECRET;
    } else {
      process.env.AUTH_FINGERPRINT_SECRET = originalSecret;
    }
  });

  it('stores keyed fingerprints and marks an identical completed request as replay', async () => {
    const record = {
      scope: 'auth.register',
      keyFingerprint: Buffer.alloc(32),
      requestFingerprint: createHmac('sha256', secret)
        .update(`request\0${payload}`)
        .digest(),
      expiresAt: new Date(Date.now() + 60_000),
      completedAt: new Date(),
    };
    const prisma = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(record),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
      },
    };
    const service = new IdempotencyService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.claim('auth.register', key, payload),
    ).resolves.toBe('claimed');
    expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: 'auth.register',
          keyFingerprint: expect.any(Uint8Array),
          requestFingerprint: expect.any(Uint8Array),
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(JSON.stringify(prisma.idempotencyRecord.create.mock.calls)).not.toContain(
      key,
    );
    await expect(
      service.claim('auth.register', key, payload),
    ).resolves.toBe('replay');
  });

  it('rejects reusing a key for a different payload', async () => {
    const priorPayload = 'prior request';
    const prisma = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          requestFingerprint: createHmac('sha256', secret)
            .update(`request\0${priorPayload}`)
            .digest(),
          expiresAt: new Date(Date.now() + 60_000),
          completedAt: new Date(),
        }),
      },
    };
    const service = new IdempotencyService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.claim('auth.register', key, payload),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

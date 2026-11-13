import { GoneException, UnauthorizedException } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthService } from './auth.service';
import { CompromisedPasswords } from './compromised-passwords';
import { EmailSender } from './email-sender';
import { IdempotencyService } from './idempotency.service';
import { PasswordHasher } from './password-hasher';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = '660e8400-e29b-41d4-a716-446655440000';

function activeUser() {
  return {
    id: userId,
    email: 'person@example.test',
    username: 'person',
    usernameNormalized: 'person',
    displayName: null,
    passwordHash: '$argon2id$stored-hash',
    status: 'active',
    passwordChangedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    roles: [
      {
        role: {
          permissions: [{ permission: { code: 'user:read' } }],
        },
      },
    ],
  };
}

function setup() {
  const transaction = {
    authToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    authToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    loginThrottle: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
    refreshToken: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('$argon2id$new-hash'),
    verify: jest.fn(),
  };
  const compromisedPasswords = {
    assertNotCompromised: jest.fn().mockResolvedValue(undefined),
  };
  const accessTokens = {
    assertConfigured: jest.fn(),
    issue: jest.fn().mockReturnValue({
      token: 'signed-access-token',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }),
  };
  const idempotency = {
    claim: jest.fn(),
    complete: jest.fn(),
    release: jest.fn(),
  };
  const emailSender = {
    assertConfigured: jest.fn(),
    publicApiOrigin: jest.fn().mockReturnValue('https://api.example.test'),
    send: jest.fn(),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordHasher,
    compromisedPasswords as unknown as CompromisedPasswords,
    accessTokens as unknown as AccessTokenService,
    idempotency as unknown as IdempotencyService,
    emailSender as unknown as EmailSender,
  );
  return {
    service,
    prisma,
    transaction,
    passwords,
    compromisedPasswords,
    accessTokens,
    idempotency,
    emailSender,
  };
}

describe('AuthService', () => {
  const originalFingerprintSecret = process.env.AUTH_FINGERPRINT_SECRET;

  beforeEach(() => {
    process.env.AUTH_FINGERPRINT_SECRET =
      'auth-fingerprint-test-secret-at-least-32-bytes';
  });

  afterAll(() => {
    if (originalFingerprintSecret === undefined) {
      delete process.env.AUTH_FINGERPRINT_SECRET;
    } else {
      process.env.AUTH_FINGERPRINT_SECRET = originalFingerprintSecret;
    }
  });

  it('uses the same generic unauthorized failure for unknown identifiers and bad passwords', async () => {
    const unknown = setup();
    unknown.prisma.user.findFirst.mockResolvedValue(null);
    const unknownError = await unknown.service
      .login('missing@example.test', 'wrong password', {
        ipAddress: null,
      })
      .catch((error: unknown) => error as UnauthorizedException);

    const incorrect = setup();
    incorrect.prisma.user.findFirst.mockResolvedValue(activeUser());
    incorrect.passwords.verify.mockResolvedValue(false);
    const incorrectError = await incorrect.service
      .login('person@example.test', 'wrong password', {
        ipAddress: null,
      })
      .catch((error: unknown) => error as UnauthorizedException);

    expect(unknownError).toBeInstanceOf(UnauthorizedException);
    expect(incorrectError).toBeInstanceOf(UnauthorizedException);
    expect(
      (unknownError as UnauthorizedException).getResponse(),
    ).toEqual((incorrectError as UnauthorizedException).getResponse());
    expect(unknown.passwords.hash).toHaveBeenCalledTimes(1);
    expect(incorrect.prisma.loginThrottle.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ failedAttempts: 1 }),
      }),
    );
  });

  it('starts a progressive lock at the fifth failed login', async () => {
    const context = setup();
    context.prisma.loginThrottle.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        failedAttempts: 4,
        lastFailureAt: new Date(),
        blockedUntil: null,
      });
    context.prisma.user.findFirst.mockResolvedValue(activeUser());
    context.passwords.verify.mockResolvedValue(false);

    await expect(
      context.service.login('person', 'incorrect', { ipAddress: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const update = context.prisma.loginThrottle.upsert.mock.calls[0][0];
    expect(update.create.failedAttempts).toBe(5);
    expect(update.create.blockedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(update.create.blockedUntil.getTime()).toBeLessThanOrEqual(
      Date.now() + 61_000,
    );
  });

  it('activates a pending account only from a valid, unconsumed verification token', async () => {
    const context = setup();
    context.transaction.authToken.findUnique.mockResolvedValue({
      id: 'verification-row',
      userId,
      purpose: AuthTokenPurpose.email_verification,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    context.transaction.authToken.updateMany.mockResolvedValue({ count: 1 });
    context.transaction.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      context.service.verifyEmail('V'.repeat(43)),
    ).resolves.toBeUndefined();
    expect(context.transaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: userId,
          status: 'pending',
          deletionRequestedAt: null,
        },
        data: { status: 'active' },
      }),
    );

    context.transaction.authToken.findUnique.mockResolvedValue({
      id: 'verification-row',
      userId,
      purpose: AuthTokenPurpose.email_verification,
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      context.service.verifyEmail('V'.repeat(43)),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('creates an opaque refresh family and returns no token through the session DTO', async () => {
    const context = setup();
    context.prisma.user.findFirst.mockResolvedValue(activeUser());
    context.passwords.verify.mockResolvedValue(true);
    context.transaction.session.create.mockResolvedValue({ id: sessionId });
    context.transaction.refreshToken.create.mockResolvedValue({});

    const session = await context.service.login(
      'PERSON',
      'correct password',
      { userAgent: 'test browser', ipAddress: '192.0.2.0/24' },
    );

    expect(session.user.id).toBe(userId);
    expect(session.permissions).toEqual(['user:read']);
    expect(session.accessToken).toBeDefined();
    expect(session.refreshToken).toHaveLength(43);
    expect(session.csrfToken).toHaveLength(43);
    expect(context.transaction.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId,
          tokenFingerprint: expect.any(Uint8Array),
        }),
      }),
    );
  });

  it('rotates a refresh token and revokes its session family when the consumed token is reused', async () => {
    const context = setup();
    const now = new Date();
    context.transaction.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-row',
      sessionId,
      tokenFingerprint: new Uint8Array(32),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    context.transaction.session.findUnique.mockResolvedValue({
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser(),
    });
    context.transaction.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    context.transaction.refreshToken.create.mockResolvedValue({});
    context.transaction.session.update.mockResolvedValue({});

    const rotated = await context.service.refresh('R'.repeat(43), {
      ipAddress: null,
    });
    expect(rotated.refreshToken).not.toBe('R'.repeat(43));
    expect(context.transaction.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { consumedAt: expect.any(Date) },
      }),
    );
    expect(context.transaction.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId },
        data: expect.objectContaining({
          lastSeenAt: expect.any(Date),
          expiresAt: expect.any(Date),
        }),
      }),
    );

    context.transaction.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-row',
      sessionId,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: now,
    });
    context.transaction.session.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      context.service.refresh('R'.repeat(43), { ipAddress: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(context.transaction.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it('consumes reset tokens once and revokes every active session', async () => {
    const context = setup();
    const resetToken = {
      id: 'reset-row',
      userId,
      purpose: AuthTokenPurpose.password_reset,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    context.prisma.authToken.findUnique.mockResolvedValue(resetToken);
    context.transaction.authToken.findUnique.mockResolvedValue({
      ...resetToken,
    });
    context.transaction.authToken.updateMany.mockResolvedValue({ count: 1 });
    context.transaction.user.update.mockResolvedValue({});
    context.transaction.session.updateMany.mockResolvedValue({ count: 2 });

    await context.service.resetPassword(
      'T'.repeat(43),
      'new safe password value',
    );
    expect(context.transaction.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { consumedAt: expect.any(Date) },
      }),
    );
    expect(context.transaction.session.updateMany).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    context.transaction.authToken.findUnique.mockResolvedValue({
      ...resetToken,
      consumedAt: new Date(),
    });
    context.prisma.authToken.findUnique.mockResolvedValue({
      ...resetToken,
      consumedAt: new Date(),
    });
    await expect(
      context.service.resetPassword('T'.repeat(43), 'new safe password value'),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('rejects an invalid reset token before checking password compromise', async () => {
    const context = setup();
    context.prisma.authToken.findUnique.mockResolvedValue(null);

    await expect(
      context.service.resetPassword('T'.repeat(43), 'candidate password'),
    ).rejects.toBeInstanceOf(GoneException);
    expect(context.compromisedPasswords.assertNotCompromised).not.toHaveBeenCalled();
    expect(context.passwords.hash).not.toHaveBeenCalled();
  });
});

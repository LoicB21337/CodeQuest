import { UnauthorizedException } from '@nestjs/common';
import { PasswordHasher } from '../auth/password-hasher';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('requires the current password and schedules deletion while revoking credentials', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          passwordHash: '$argon2id$hash',
          deletionScheduledAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      session: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      authToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const passwords = {
      verify: jest.fn().mockResolvedValue(true),
    };
    const users = new UsersService(
      prisma as unknown as PrismaService,
      passwords as unknown as PasswordHasher,
    );

    const before = Date.now();
    const deletion = await users.requestDeletion(
      '550e8400-e29b-41d4-a716-446655440000',
      'correct password',
    );
    const expectedDelay = 30 * 24 * 60 * 60 * 1000;
    expect(deletion.deletionScheduledAt.getTime()).toBeGreaterThanOrEqual(
      before + expectedDelay,
    );
    expect(deletion.deletionScheduledAt.getTime()).toBeLessThanOrEqual(
      Date.now() + expectedDelay,
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { revokedAt: expect.any(Date) },
      }),
    );
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { consumedAt: expect.any(Date) },
      }),
    );
  });

  it('rejects account deletion without password reauthentication', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          passwordHash: '$argon2id$hash',
          deletionScheduledAt: null,
        }),
      },
    };
    const passwords = { verify: jest.fn().mockResolvedValue(false) };
    const users = new UsersService(
      prisma as unknown as PrismaService,
      passwords as unknown as PasswordHasher,
    );

    await expect(
      users.requestDeletion(
        '550e8400-e29b-41d4-a716-446655440000',
        'wrong password',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('exports account data without password hashes or token fingerprints', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'person@example.test',
          username: 'person',
          displayName: null,
          status: 'active',
          passwordHash: '$argon2id$must-not-export',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletionRequestedAt: null,
          deletionScheduledAt: null,
          roles: [{ role: { code: 'player' } }],
          sessions: [
            {
              id: '660e8400-e29b-41d4-a716-446655440000',
              ipAddress: '192.0.2.0/24',
            },
          ],
        }),
      },
    };
    const users = new UsersService(
      prisma as unknown as PrismaService,
      {} as PasswordHasher,
    );

    const exportData = await users.exportPersonalData(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const serialized = JSON.stringify(exportData);
    expect(exportData).toHaveProperty('roles', ['player']);
    expect(serialized).not.toContain('must-not-export');
    expect(serialized).not.toContain('tokenFingerprint');
  });
});

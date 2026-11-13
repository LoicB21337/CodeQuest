import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PasswordHasher } from '../auth/password-hasher';
import { PrismaService } from '../prisma/prisma.service';

const deletionGraceMs = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasher,
  ) {}

  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletionRequestedAt: true,
        deletionScheduledAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async updateProfile(
    userId: string,
    username: string,
  ): Promise<Record<string, unknown>> {
    const normalized = username.normalize('NFKC').trim().toLowerCase();
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          username: username.normalize('NFKC').trim(),
          usernameNormalized: normalized,
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return user;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'USERNAME_UNAVAILABLE',
          message: 'The requested username is not available.',
        });
      }
      throw error;
    }
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async exportPersonalData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { select: { code: true } } } },
        sessions: {
          select: {
            id: true,
            createdAt: true,
            lastSeenAt: true,
            expiresAt: true,
            revokedAt: true,
            userAgent: true,
            ipAddress: true,
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletionRequestedAt: user.deletionRequestedAt,
        deletionScheduledAt: user.deletionScheduledAt,
      },
      roles: user.roles.map(({ role }) => role.code).sort(),
      sessions: user.sessions,
    };
  }

  async requestDeletion(
    userId: string,
    password: string,
  ): Promise<{ deletionScheduledAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, deletionScheduledAt: true },
    });
    if (!user || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException();
    }
    if (user.deletionScheduledAt) {
      return { deletionScheduledAt: user.deletionScheduledAt };
    }

    const now = new Date();
    const deletionScheduledAt = new Date(now.getTime() + deletionGraceMs);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: now, deletionScheduledAt },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.authToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      }),
    ]);

    return { deletionScheduledAt };
  }

  async purgeDueAccounts(): Promise<number> {
    const result = await this.prisma.user.deleteMany({
      where: { deletionScheduledAt: { lte: new Date() } },
    });
    return result.count;
  }

  async listUsers(cursor: string | undefined, limit: number) {
    const users = await this.prisma.user.findMany({
      where: { deletionRequestedAt: null },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        status: true,
        createdAt: true,
      },
    });
    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }
}

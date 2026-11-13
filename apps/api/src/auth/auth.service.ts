import {
  BadRequestException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenPurpose, Prisma } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { CompromisedPasswords } from './compromised-passwords';
import { EMAIL_SENDER, EmailSender } from './email-sender';
import { IdempotencyService } from './idempotency.service';
import { PasswordHasher } from './password-hasher';
import {
  databaseBytes,
  fingerprintToken,
  issueOpaqueToken,
} from './token-fingerprint';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 30 * 60 * 1000;
const LOGIN_LOCK_BASE_MS = 60 * 1000;
const LOGIN_LOCK_MAX_MS = 15 * 60 * 1000;

const userIdentityInclude = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;

type UserWithIdentity = Prisma.UserGetPayload<{
  include: typeof userIdentityInclude;
}>;

export interface AuthenticatedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: Date;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    status: string;
  };
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasher,
    private readonly compromisedPasswords: CompromisedPasswords,
    private readonly accessTokens: AccessTokenService,
    private readonly idempotency: IdempotencyService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async register(
    input: { email: string; username: string; password: string },
    idempotencyKey: string,
    remoteIp: string | null,
  ): Promise<{ status: 'accepted' }> {
    this.emailSender.assertConfigured();
    await this.compromisedPasswords.assertNotCompromised(input.password);

    const email = this.normalizeEmail(input.email);
    const username = input.username.normalize('NFKC').trim();
    const usernameNormalized = this.normalizeUsername(username);
    await this.enforceRequestLimit('registration-email', email, 5);
    if (remoteIp) {
      await this.enforceRequestLimit('registration-ip', remoteIp, 20);
    }
    const claim = await this.idempotency.claim(
      'auth.register',
      idempotencyKey,
      JSON.stringify({ email, usernameNormalized, password: input.password }),
    );
    if (claim === 'replay') {
      return { status: 'accepted' };
    }

    try {
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [{ email }, { usernameNormalized }],
        },
      });

      let verificationLink: string | undefined;
      if (!existing) {
        const passwordHash = await this.passwords.hash(input.password);
        try {
          const user = await this.prisma.$transaction(async (transaction) => {
            const playerRole = await transaction.role.findUnique({
              where: { code: 'player' },
            });
            if (!playerRole) {
              throw new ServiceUnavailableException(
                'Default account role is not provisioned.',
              );
            }
            const created = await transaction.user.create({
              data: {
                email,
                username,
                usernameNormalized,
                passwordHash,
                status: 'pending',
              },
            });
            await transaction.userRole.create({
              data: { userId: created.id, roleId: playerRole.id },
            });
            return created;
          });
          verificationLink = await this.createEmailVerificationLink(user.id);
        } catch (error) {
          if (!this.isUniqueViolation(error)) {
            throw error;
          }
        }
      } else if (
        existing.email === email &&
        existing.status === 'pending' &&
        !existing.deletionRequestedAt
      ) {
        verificationLink = await this.createEmailVerificationLink(existing.id);
      }

      await this.emailSender.send({
        recipient: email,
        subject: 'CodeQuest — instructions de confirmation',
        text: verificationLink
          ? `Pour confirmer votre adresse, ouvrez ce lien : ${verificationLink}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`
          : "Si une confirmation de compte est nécessaire pour cette adresse, suivez le lien reçu dans le message correspondant. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      });
    } catch (error) {
      try {
        await this.idempotency.release('auth.register', idempotencyKey);
      } catch {
        // Preserve the original operation error without logging it.
      }
      throw error;
    }
    await this.idempotency.complete('auth.register', idempotencyKey);
    return { status: 'accepted' };
  }

  async verifyEmail(token: string): Promise<void> {
    const now = new Date();
    const tokenFingerprint = this.tokenFingerprint(token);
    const verified = await this.prisma.$transaction(async (transaction) => {
      const authToken = await transaction.authToken.findUnique({
        where: { tokenFingerprint },
      });
      if (
        !authToken ||
        authToken.purpose !== AuthTokenPurpose.email_verification ||
        authToken.consumedAt ||
        authToken.expiresAt <= now
      ) {
        return false;
      }

      const consumed = await transaction.authToken.updateMany({
        where: {
          id: authToken.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        return false;
      }

      const activated = await transaction.user.updateMany({
        where: {
          id: authToken.userId,
          status: 'pending',
          deletionRequestedAt: null,
        },
        data: { status: 'active' },
      });
      return activated.count === 1;
    });

    if (!verified) {
      throw new GoneException({
        code: 'TOKEN_INVALID',
        message: 'The verification token is invalid or expired.',
      });
    }
  }

  async login(
    identifier: string,
    password: string,
    metadata: { userAgent?: string; ipAddress: string | null },
  ): Promise<AuthenticatedSession> {
    this.accessTokens.assertConfigured();
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const identifierFingerprint = this.identifierFingerprint(
      'login',
      normalizedIdentifier,
    );
    const now = new Date();

    const throttle = await this.prisma.loginThrottle.findUnique({
      where: { identifierFingerprint },
    });
    if (throttle?.blockedUntil && throttle.blockedUntil > now) {
      await this.passwords.hash(password);
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findFirst({
      where: normalizedIdentifier.includes('@')
        ? { email: normalizedIdentifier }
        : { usernameNormalized: normalizedIdentifier },
      include: userIdentityInclude,
    });

    const passwordMatches = user
      ? await this.passwords.verify(user.passwordHash, password)
      : (await this.passwords.hash(password), false);
    if (
      !user ||
      !passwordMatches ||
      user.status !== 'active' ||
      user.deletionRequestedAt
    ) {
      await this.recordLoginFailure(identifierFingerprint, user?.id);
      throw new UnauthorizedException();
    }

    await this.prisma.loginThrottle.deleteMany({
      where: { identifierFingerprint },
    });
    return this.createSession(user, metadata);
  }

  async refresh(
    rawRefreshToken: string | undefined,
    metadata: { userAgent?: string; ipAddress: string | null },
  ): Promise<AuthenticatedSession> {
    this.accessTokens.assertConfigured();
    if (!rawRefreshToken) {
      throw new UnauthorizedException();
    }
    const now = new Date();
    const fingerprint = this.tokenFingerprint(rawRefreshToken);
    const newRefresh = issueOpaqueToken();

    const rotation = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.refreshToken.findUnique({
        where: { tokenFingerprint: fingerprint },
      });
      if (!record) {
        return { result: 'invalid' as const };
      }
      const session = await transaction.session.findUnique({
        where: { id: record.sessionId },
        include: { user: { include: userIdentityInclude } },
      });
      if (!session) {
        return { result: 'invalid' as const };
      }

      if (record.consumedAt) {
        await transaction.session.updateMany({
          where: { id: record.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { result: 'replay' as const };
      }

      if (
        record.expiresAt <= now ||
        session.expiresAt <= now ||
        session.revokedAt ||
        session.user.status !== 'active' ||
        session.user.deletionRequestedAt
      ) {
        return { result: 'invalid' as const };
      }

      const consumed = await transaction.refreshToken.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        await transaction.session.updateMany({
          where: { id: record.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { result: 'replay' as const };
      }

      const refreshExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await transaction.refreshToken.create({
        data: {
          sessionId: record.sessionId,
          tokenFingerprint: databaseBytes(
            Buffer.from(newRefresh.fingerprint, 'hex'),
          ),
          expiresAt: refreshExpiresAt,
        },
      });
      await transaction.session.update({
        where: { id: record.sessionId },
        data: {
          tokenFingerprint: databaseBytes(
            Buffer.from(newRefresh.fingerprint, 'hex'),
          ),
          lastSeenAt: now,
          expiresAt: refreshExpiresAt,
          userAgent: metadata.userAgent?.slice(0, 255),
          ipAddress: metadata.ipAddress,
        },
      });
      return {
        result: 'rotated' as const,
        sessionId: record.sessionId,
        user: session.user,
      };
    });

    if (rotation.result !== 'rotated') {
      throw new UnauthorizedException();
    }
    return this.sessionResponse(
      rotation.user,
      rotation.sessionId,
      newRefresh.token,
    );
  }

  async logout(
    userId: string,
    sessionId: string,
    everywhere: boolean,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.session.updateMany({
      where: everywhere
        ? { userId, revokedAt: null }
        : { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async requestPasswordReset(emailInput: string, remoteIp: string | null): Promise<void> {
    this.emailSender.assertConfigured();
    const email = this.normalizeEmail(emailInput);
    await this.enforceRequestLimit('password-reset-email', email, 5);
    if (remoteIp) {
      await this.enforceRequestLimit('password-reset-ip', remoteIp, 20);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    let resetLink: string | undefined;
    if (
      user &&
      user.status === 'active' &&
      !user.deletionRequestedAt
    ) {
      const rawToken = issueOpaqueToken();
      const now = new Date();
      await this.prisma.$transaction(async (transaction) => {
        await transaction.authToken.updateMany({
          where: {
            userId: user.id,
            purpose: AuthTokenPurpose.password_reset,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        await transaction.authToken.create({
          data: {
            userId: user.id,
            purpose: AuthTokenPurpose.password_reset,
            tokenFingerprint: databaseBytes(
              Buffer.from(rawToken.fingerprint, 'hex'),
            ),
            expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
          },
        });
      });
      resetLink = this.actionLink('reset-password', rawToken.token);
    }

    await this.emailSender.send({
      recipient: email,
      subject: 'CodeQuest — demande de réinitialisation',
      text: resetLink
        ? `Si vous avez demandé à réinitialiser votre mot de passe, ouvrez ce lien à usage unique (valable une heure) : ${resetLink}\n\nIgnorez ce message si vous n'êtes pas à l'origine de cette demande.`
        : "Si un compte CodeQuest existe pour cette adresse et qu'une réinitialisation a été demandée, vous recevrez les instructions correspondantes. Ignorez ce message si vous n'êtes pas à l'origine de cette demande.",
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const fingerprint = this.tokenFingerprint(token);
    const preflight = await this.prisma.authToken.findUnique({
      where: { tokenFingerprint: fingerprint },
    });
    const now = new Date();
    if (
      !preflight ||
      preflight.purpose !== AuthTokenPurpose.password_reset ||
      preflight.consumedAt ||
      preflight.expiresAt <= now
    ) {
      throw new GoneException({
        code: 'TOKEN_INVALID',
        message: 'The reset token is invalid, expired, or already used.',
      });
    }

    await this.compromisedPasswords.assertNotCompromised(newPassword);
    const passwordHash = await this.passwords.hash(newPassword);

    const reset = await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.authToken.updateMany({
        where: {
          id: preflight.id,
          purpose: AuthTokenPurpose.password_reset,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        return false;
      }
      await transaction.user.update({
        where: { id: preflight.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      await transaction.session.updateMany({
        where: { userId: preflight.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });

    if (!reset) {
      throw new GoneException({
        code: 'TOKEN_INVALID',
        message: 'The reset token is invalid, expired, or already used.',
      });
    }
  }

  private async createEmailVerificationLink(userId: string): Promise<string> {
    const rawToken = issueOpaqueToken();
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.authToken.updateMany({
        where: {
          userId,
          purpose: AuthTokenPurpose.email_verification,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      await transaction.authToken.create({
        data: {
          userId,
          purpose: AuthTokenPurpose.email_verification,
          tokenFingerprint: databaseBytes(
            Buffer.from(rawToken.fingerprint, 'hex'),
          ),
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        },
      });
    });
    return this.actionLink('verify-email', rawToken.token);
  }

  private async createSession(
    user: UserWithIdentity,
    metadata: { userAgent?: string; ipAddress: string | null },
  ): Promise<AuthenticatedSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const refresh = issueOpaqueToken();
    const session = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.session.create({
        data: {
          userId: user.id,
          tokenFingerprint: databaseBytes(
            Buffer.from(refresh.fingerprint, 'hex'),
          ),
          createdAt: now,
          lastSeenAt: now,
          lastReauthenticatedAt: now,
          expiresAt,
          userAgent: metadata.userAgent?.slice(0, 255),
          ipAddress: metadata.ipAddress,
        },
      });
      await transaction.refreshToken.create({
        data: {
          sessionId: created.id,
          tokenFingerprint: databaseBytes(
            Buffer.from(refresh.fingerprint, 'hex'),
          ),
          expiresAt,
        },
      });
      return created;
    });
    return this.sessionResponse(user, session.id, refresh.token);
  }

  private sessionResponse(
    user: UserWithIdentity,
    sessionId: string,
    refreshToken: string,
  ): AuthenticatedSession {
    const access = this.accessTokens.issue(user.id, sessionId);
    const permissions = this.permissionsFor(user);
    return {
      accessToken: access.token,
      refreshToken,
      csrfToken: randomBytes(32).toString('base64url'),
      accessExpiresAt: access.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        status: user.status,
      },
      permissions,
    };
  }

  private permissionsFor(user: UserWithIdentity): string[] {
    return [
      ...new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions.map(
            (rolePermission) => rolePermission.permission.code,
          ),
        ),
      ),
    ].sort();
  }

  private async recordLoginFailure(
    identifierFingerprint: Uint8Array<ArrayBuffer>,
    userId?: string,
  ): Promise<void> {
    const now = new Date();
    const previous = await this.prisma.loginThrottle.findUnique({
      where: { identifierFingerprint },
    });
    const withinWindow =
      previous && now.getTime() - previous.lastFailureAt.getTime() < LOGIN_WINDOW_MS;
    const failedAttempts = withinWindow ? previous.failedAttempts + 1 : 1;
    const lockDuration =
      failedAttempts < 5
        ? 0
        : Math.min(
            LOGIN_LOCK_BASE_MS * 2 ** (failedAttempts - 5),
            LOGIN_LOCK_MAX_MS,
          );
    const blockedUntil = lockDuration
      ? new Date(now.getTime() + lockDuration)
      : null;

    await this.prisma.loginThrottle.upsert({
      where: { identifierFingerprint },
      create: {
        identifierFingerprint,
        userId,
        failedAttempts,
        blockedUntil,
        lastFailureAt: now,
      },
      update: {
        userId,
        failedAttempts,
        blockedUntil,
        lastFailureAt: now,
      },
    });
  }

  private async enforceRequestLimit(
    scope: string,
    identifier: string,
    maximumRequests: number,
  ): Promise<void> {
    const fingerprint = this.identifierFingerprint(scope, identifier);
    const now = new Date();
    const previous = await this.prisma.loginThrottle.findUnique({
      where: { identifierFingerprint: fingerprint },
    });
    if (
      previous?.blockedUntil &&
      previous.blockedUntil > now
    ) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again later.',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((previous.blockedUntil.getTime() - now.getTime()) / 1000),
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const attempts =
      previous && now.getTime() - previous.lastFailureAt.getTime() < 60 * 60 * 1000
        ? previous.failedAttempts + 1
        : 1;
    const blockedUntil =
      attempts >= maximumRequests
        ? new Date(now.getTime() + 60 * 60 * 1000)
        : null;
    await this.prisma.loginThrottle.upsert({
      where: { identifierFingerprint: fingerprint },
      create: {
        identifierFingerprint: fingerprint,
        failedAttempts: attempts,
        blockedUntil,
        lastFailureAt: now,
      },
      update: {
        failedAttempts: attempts,
        blockedUntil,
        lastFailureAt: now,
      },
    });
  }

  private identifierFingerprint(
    scope: string,
    identifier: string,
  ): Uint8Array<ArrayBuffer> {
    const secret = process.env.AUTH_FINGERPRINT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException(
        'Authentication throttling is not configured.',
      );
    }
    return databaseBytes(
      createHmac('sha256', secret)
        .update(`${scope}\0${identifier}`)
        .digest(),
    );
  }

  private tokenFingerprint(token: string): Uint8Array<ArrayBuffer> {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'The supplied token is invalid.',
      });
    }
    return databaseBytes(Buffer.from(fingerprintToken(token), 'hex'));
  }

  private actionLink(path: string, token: string): string {
    const origin = this.emailSender.publicApiOrigin();
    if (!origin) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured.',
      );
    }
    const url = new URL('api/v1/auth/email-action', `${origin}/`);
    url.hash = new URLSearchParams({ flow: path, token }).toString();
    return url.toString();
  }

  private normalizeEmail(email: string): string {
    return email.normalize('NFKC').trim().toLowerCase();
  }

  private normalizeUsername(username: string): string {
    return username.normalize('NFKC').trim().toLowerCase();
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.normalize('NFKC').trim().toLowerCase();
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

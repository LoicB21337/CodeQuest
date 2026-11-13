import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { ACCESS_COOKIE, readCookie } from './http-cookies';
import { AuthenticatedRequest } from './request-principal';

const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const token = readCookie(request, ACCESS_COOKIE);
    if (!token) {
      throw new UnauthorizedException();
    }

    const claims = this.accessTokens.verify(token);
    if (!claims) {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const now = new Date();
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'active' ||
      session.user.deletionRequestedAt
    ) {
      throw new UnauthorizedException();
    }

    const permissions = new Set(
      session.user.roles.flatMap((userRole) =>
        userRole.role.permissions.map(
          (rolePermission) => rolePermission.permission.code,
        ),
      ),
    );
    const expiresAt = new Date(now.getTime() + refreshLifetimeMs);
    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now, expiresAt },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          sessionId: session.id,
          tokenFingerprint: session.tokenFingerprint,
          consumedAt: null,
        },
        data: { expiresAt },
      }),
    ]);
    request.principal = {
      userId: session.userId,
      sessionId: session.id,
      permissions,
    };
    return true;
  }
}

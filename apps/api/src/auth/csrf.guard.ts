import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AuthenticatedRequest } from './request-principal';
import { CSRF_COOKIE, CSRF_HEADER, readCookie } from './http-cookies';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const allowedOrigin = process.env.APP_ORIGIN;
    if (!allowedOrigin) {
      throw new ServiceUnavailableException(
        'Same-origin protection is not configured.',
      );
    }

    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(allowedOrigin).origin;
    } catch {
      throw new ServiceUnavailableException(
        'Same-origin protection is not configured.',
      );
    }
    if (request.headers.origin !== expectedOrigin) {
      throw new ForbiddenException();
    }

    const csrfCookie = readCookie(request, CSRF_COOKIE);
    const csrfHeader = request.headers[CSRF_HEADER];
    const suppliedHeader = Array.isArray(csrfHeader)
      ? csrfHeader[0]
      : csrfHeader;
    if (!csrfCookie || !suppliedHeader) {
      throw new ForbiddenException();
    }
    const expectedToken = Buffer.from(csrfCookie);
    const receivedToken = Buffer.from(suppliedHeader);
    if (
      expectedToken.length !== receivedToken.length ||
      !timingSafeEqual(expectedToken, receivedToken)
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}

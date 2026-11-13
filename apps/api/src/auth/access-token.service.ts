import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
  iss: 'codequest-api';
  aud: 'codequest-client';
}

@Injectable()
export class AccessTokenService {
  readonly lifetimeSeconds = 15 * 60;

  assertConfigured(): void {
    this.secret();
  }

  issue(userId: string, sessionId: string, now = Date.now()): {
    token: string;
    expiresAt: Date;
  } {
    const issuedAt = Math.floor(now / 1000);
    const expiresAt = issuedAt + this.lifetimeSeconds;
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encode({
      sub: userId,
      sid: sessionId,
      iat: issuedAt,
      exp: expiresAt,
      iss: 'codequest-api',
      aud: 'codequest-client',
    });
    const message = `${header}.${payload}`;
    return {
      token: `${message}.${this.sign(message).toString('base64url')}`,
      expiresAt: new Date(expiresAt * 1000),
    };
  }

  verify(token: string, now = Date.now()): AccessTokenClaims | undefined {
    const [headerPart, payloadPart, signaturePart, extra] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart || extra) {
      return undefined;
    }

    try {
      const header = JSON.parse(
        Buffer.from(headerPart, 'base64url').toString('utf8'),
      ) as { alg?: string; typ?: string };
      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return undefined;
      }

      const receivedSignature = Buffer.from(signaturePart, 'base64url');
      const expectedSignature = this.sign(`${headerPart}.${payloadPart}`);
      if (
        receivedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(receivedSignature, expectedSignature)
      ) {
        return undefined;
      }

      const claims = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf8'),
      ) as Partial<AccessTokenClaims>;
      const nowSeconds = Math.floor(now / 1000);
      if (
        typeof claims.sub !== 'string' ||
        typeof claims.sid !== 'string' ||
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        claims.iss !== 'codequest-api' ||
        claims.aud !== 'codequest-client' ||
        claims.iat > nowSeconds + 60 ||
        claims.exp <= nowSeconds ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > this.lifetimeSeconds
      ) {
        return undefined;
      }
      return claims as AccessTokenClaims;
    } catch {
      return undefined;
    }
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private sign(message: string): Buffer {
    return createHmac('sha256', this.secret()).update(message).digest();
  }

  private secret(): string {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException(
        'Access-token signing is not configured.',
      );
    }
    return secret;
  }
}

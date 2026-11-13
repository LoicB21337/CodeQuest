import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { databaseBytes } from './token-fingerprint';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    scope: string,
    key: string,
    payload: string,
  ): Promise<'claimed' | 'replay'> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw new HttpException(
        {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'A UUID v4 Idempotency-Key is required.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const secret = process.env.AUTH_FINGERPRINT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException(
        'Idempotency protection is not configured.',
      );
    }

    const keyFingerprint = databaseBytes(
      this.hmac(secret, `key\0${scope}\0${key}`),
    );
    const requestFingerprint = databaseBytes(
      this.hmac(secret, `request\0${payload}`),
    );
    const now = new Date();
    const uniqueKey = {
      scope_keyFingerprint: { scope, keyFingerprint },
    };

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: uniqueKey,
    });
    if (existing && existing.expiresAt > now) {
      if (!timingSafeEqual(existing.requestFingerprint, requestFingerprint)) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'The idempotency key was already used for another request.',
        });
      }
      if (existing.completedAt) {
        return 'replay';
      }
      throw new ConflictException({
        code: 'REQUEST_IN_PROGRESS',
        message: 'A request using this idempotency key is still in progress.',
      });
    }

    if (existing) {
      await this.prisma.idempotencyRecord.delete({ where: uniqueKey });
    }

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          scope,
          keyFingerprint,
          requestFingerprint,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      return 'claimed';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.idempotencyRecord.findUnique({
          where: uniqueKey,
        });
        if (
          concurrent &&
          concurrent.expiresAt > now &&
          timingSafeEqual(concurrent.requestFingerprint, requestFingerprint)
        ) {
          if (concurrent.completedAt) {
            return 'replay';
          }
          throw new ConflictException({
            code: 'REQUEST_IN_PROGRESS',
            message: 'A request using this idempotency key is still in progress.',
          });
        }
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'The idempotency key was already used for another request.',
        });
      }
      throw error;
    }
  }

  async complete(scope: string, key: string): Promise<void> {
    const keyFingerprint = this.keyFingerprint(scope, key);
    await this.prisma.idempotencyRecord.update({
      where: {
        scope_keyFingerprint: { scope, keyFingerprint },
      },
      data: { completedAt: new Date() },
    });
  }

  async release(scope: string, key: string): Promise<void> {
    const keyFingerprint = this.keyFingerprint(scope, key);
    await this.prisma.idempotencyRecord.deleteMany({
      where: {
        scope,
        keyFingerprint,
        completedAt: null,
      },
    });
  }

  private keyFingerprint(scope: string, key: string): Uint8Array<ArrayBuffer> {
    const secret = process.env.AUTH_FINGERPRINT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException(
        'Idempotency protection is not configured.',
      );
    }
    return databaseBytes(this.hmac(secret, `key\0${scope}\0${key}`));
  }

  private hmac(secret: string, value: string): Buffer {
    return createHmac('sha256', secret).update(value).digest();
  }
}

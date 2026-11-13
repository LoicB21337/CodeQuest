import {
  BadRequestException,
  ServiceUnavailableException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ApiErrorFilter } from '../api-error.filter';
import { AppController } from '../app.controller';
import { AuthController } from './auth.controller';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { PermissionsGuard } from './permissions.guard';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';

describe('Phase 0 HTTP routes', () => {
  let app: INestApplication;
  const issuedSession = {
    accessToken: 'access-secret-not-for-response',
    refreshToken: 'refresh-secret-not-for-response',
    csrfToken: 'csrf-secret-not-for-response',
    accessExpiresAt: new Date('2026-11-13T16:00:00.000Z'),
    user: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'person@example.test',
      username: 'person',
      displayName: null,
      status: 'active',
    },
    permissions: ['user:read'],
  };
  const auth = {
    register: jest.fn().mockResolvedValue({ status: 'accepted' }),
    verifyEmail: jest.fn().mockResolvedValue(undefined),
    login: jest.fn().mockResolvedValue(issuedSession),
    refresh: jest.fn().mockResolvedValue(issuedSession),
    logout: jest.fn().mockResolvedValue(undefined),
    requestPasswordReset: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    getProfile: jest.fn().mockResolvedValue(issuedSession.user),
    updateProfile: jest.fn().mockResolvedValue(issuedSession.user),
    listSessions: jest.fn().mockResolvedValue([]),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    exportPersonalData: jest.fn().mockResolvedValue({ schemaVersion: 1 }),
    requestDeletion: jest
      .fn()
      .mockResolvedValue({ deletionScheduledAt: '2026-12-13T00:00:00.000Z' }),
    listUsers: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  };

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      controllers: [AuthController, UsersController, AppController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: users },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
            canActivate: (context: {
              switchToHttp: () => { getRequest: () => Record<string, unknown> };
            }) => {
              context.switchToHttp().getRequest().principal = {
                userId: issuedSession.user.id,
                sessionId: '660e8400-e29b-41d4-a716-446655440000',
                permissions: new Set(['user:read']),
              };
              return true;
            },
          })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true });
    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            details: errors.map((error) => ({
              field: error.property,
              code: Object.keys(error.constraints ?? {})[0] ?? 'INVALID',
            })),
          }),
      }),
    );
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('serves each documented authentication and account operation', async () => {
    const idempotencyKey = '123e4567-e89b-42d3-a456-426614174000';
    const token = 'A'.repeat(43);

    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/api/v1/auth/email-action')
      .expect(200)
      .expect('Referrer-Policy', 'no-referrer')
      .expect('Cache-Control', 'no-store');
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        email: 'person@example.test',
        username: 'person',
        password: 'correct horse battery staple',
      })
      .expect(202, { status: 'accepted' });
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(204);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'person@example.test', password: 'correct horse battery staple' })
      .expect(200);
    const cookieHeader: unknown = login.headers['set-cookie'];
    const cookies = Array.isArray(cookieHeader)
      ? cookieHeader.map(String)
      : [String(cookieHeader)];
    expect(cookies).toHaveLength(3);
    expect(
      cookies.some(
        (value) =>
          value.startsWith('__Host-cq_access=') &&
          value.includes('HttpOnly') &&
          value.includes('Secure') &&
          value.includes('SameSite=Lax'),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (value) =>
          value.startsWith('__Host-cq_refresh=') &&
          value.includes('HttpOnly') &&
          value.includes('Secure') &&
          value.includes('SameSite=Lax'),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (value) =>
          value.startsWith('__Host-cq_csrf=') &&
          value.includes('Secure') &&
          value.includes('SameSite=Lax'),
      ),
    ).toBe(true);
    expect(login.body).not.toHaveProperty('accessToken');
    expect(login.body).not.toHaveProperty('refreshToken');
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', '__Host-cq_refresh=opaque')
      .set('Origin', 'https://codequest.example')
      .set('X-CSRF-Token', 'csrf')
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ everywhere: true })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'person@example.test' })
      .expect(202, { status: 'accepted' });
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'a different safe password' })
      .expect(204);

    await request(app.getHttpServer()).get('/api/v1/me').expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .send({ username: 'other-person' })
      .expect(200);
    await request(app.getHttpServer()).get('/api/v1/me/export').expect(200);
    await request(app.getHttpServer()).get('/api/v1/me/sessions').expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/me/sessions/660e8400-e29b-41d4-a716-446655440001')
      .expect(204);
    const revokeCurrentSession = await request(app.getHttpServer())
      .delete('/api/v1/me/sessions/660e8400-e29b-41d4-a716-446655440000')
      .expect(204);
    expect(revokeCurrentSession.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('__Host-cq_access=;'),
        expect.stringContaining('__Host-cq_refresh=;'),
        expect.stringContaining('__Host-cq_csrf=;'),
      ]),
    );
    const deletion = await request(app.getHttpServer())
      .delete('/api/v1/me')
      .send({ password: 'correct horse battery staple' })
      .expect(202);
    expect(deletion.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('__Host-cq_access=;'),
        expect.stringContaining('__Host-cq_refresh=;'),
        expect.stringContaining('__Host-cq_csrf=;'),
      ]),
    );
    await request(app.getHttpServer())
      .get('/api/v1/admin/users?limit=25')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/users?cursor=not-a-uuid')
      .expect(400);
  });

  it('returns a consistent error envelope for invalid DTOs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'not-an-email', password: '' })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        requestId: expect.any(String),
        details: expect.any(Array),
      }),
    );
  });

  it('does not expose internal service-unavailable messages', async () => {
    auth.login.mockRejectedValueOnce(
      new ServiceUnavailableException('Default account role is not provisioned.'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'person@example.test', password: 'a valid password' })
      .expect(503);

    expect(response.body.message).toBe('The request could not be completed.');
    expect(response.body.message).not.toContain('role');
  });
});

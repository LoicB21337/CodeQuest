import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { CSRF_COOKIE, CSRF_HEADER } from './http-cookies';

function contextFor(cookie: string, header: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          origin: 'https://codequest.example',
          [CSRF_HEADER]: header,
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const originalOrigin = process.env.APP_ORIGIN;

  beforeEach(() => {
    process.env.APP_ORIGIN = 'https://codequest.example';
  });

  afterAll(() => {
    if (originalOrigin === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = originalOrigin;
    }
  });

  it('rejects a same-character-length token whose UTF-8 byte length differs', () => {
    const guard = new CsrfGuard();

    expect(() => guard.canActivate(contextFor('a', 'é'))).toThrow(
      ForbiddenException,
    );
  });
});

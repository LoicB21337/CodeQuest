import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  requestId: string;
  details?: Array<{ field: string; code: string }>;
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = typeof raw === 'object' && raw !== null ? raw : {};
    const error = body as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      retryAfterSeconds?: unknown;
    };
    const code =
      typeof error.code === 'string'
        ? error.code
        : this.defaultCode(status);
    const message =
      status >= 500
        ? 'The request could not be completed.'
        : typeof error.message === 'string'
          ? error.message
          : this.defaultMessage(status);
    const details = Array.isArray(error.details)
      ? error.details.filter(
          (detail): detail is { field: string; code: string } =>
            typeof detail === 'object' &&
            detail !== null &&
            typeof (detail as { field?: unknown }).field === 'string' &&
            typeof (detail as { code?: unknown }).code === 'string',
        )
      : undefined;
    const payload: ApiErrorBody = {
      status,
      code,
      message,
      requestId: randomUUID(),
      ...(details ? { details } : {}),
    };

    if (
      status === HttpStatus.TOO_MANY_REQUESTS &&
      typeof error.retryAfterSeconds === 'number' &&
      Number.isFinite(error.retryAfterSeconds)
    ) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(error.retryAfterSeconds))),
      );
    }
    if (request.originalUrl.startsWith('/api/v1/')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    response.status(status).json(payload);
  }

  private defaultCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.GONE:
        return 'TOKEN_INVALID';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    }
  }

  private defaultMessage(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'Authentication is required or the credentials are invalid.';
      case HttpStatus.FORBIDDEN:
        return 'The request is not permitted.';
      case HttpStatus.NOT_FOUND:
        return 'The requested resource was not found.';
      case HttpStatus.GONE:
        return 'The supplied token is invalid or expired.';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too many requests. Try again later.';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'The requested service is unavailable.';
      default:
        return 'The request could not be completed.';
    }
  }
}

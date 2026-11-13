import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './api-error.filter';

function configuredHttpsOptions():
  | { cert: Buffer; key: Buffer }
  | undefined {
  const certificateFile = process.env.HTTPS_CERT_FILE;
  const privateKeyFile = process.env.HTTPS_KEY_FILE;
  if (!certificateFile && !privateKeyFile) {
    return undefined;
  }
  if (!certificateFile || !privateKeyFile) {
    throw new Error('Both HTTPS_CERT_FILE and HTTPS_KEY_FILE are required.');
  }
  return {
    cert: readFileSync(certificateFile),
    key: readFileSync(privateKeyFile),
  };
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    httpsOptions: configuredHttpsOptions(),
  });
  app.use(helmet());
  const configuredOrigin = process.env.APP_ORIGIN;
  if (configuredOrigin) {
    const allowedOrigin = new URL(configuredOrigin).origin;
    app.enableCors({
      origin: allowedOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: [
        'Content-Type',
        'Idempotency-Key',
        'X-CSRF-Token',
      ],
    });
  }
  app.use((request: { originalUrl: string }, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    if (request.originalUrl.startsWith('/api/v1/')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
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
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

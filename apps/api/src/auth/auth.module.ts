import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CompromisedPasswords } from './compromised-passwords';
import { CsrfGuard } from './csrf.guard';
import { EMAIL_SENDER, SmtpEmailSender } from './email-sender';
import { IdempotencyService } from './idempotency.service';
import { PasswordHasher } from './password-hasher';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AccessTokenGuard,
    AccessTokenService,
    AuthService,
    CompromisedPasswords,
    CsrfGuard,
    IdempotencyService,
    PasswordHasher,
    PermissionsGuard,
    SmtpEmailSender,
    { provide: EMAIL_SENDER, useExisting: SmtpEmailSender },
  ],
  exports: [
    AccessTokenGuard,
    AccessTokenService,
    CsrfGuard,
    EMAIL_SENDER,
    PasswordHasher,
    PermissionsGuard,
  ],
})
export class AuthModule {}

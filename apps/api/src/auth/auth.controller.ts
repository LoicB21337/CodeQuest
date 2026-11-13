import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from './access-token.guard';
import {
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  approximateIp,
  appendCookie,
  clearAuthCookies,
  readCookie,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  setCsrfCookie,
} from './http-cookies';
import { AuthenticatedRequest } from './request-principal';
import { randomBytes } from 'node:crypto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('email-action')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  emailAction(@Res() response: Response): void {
    const nonce = randomBytes(18).toString('base64');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.type('html').send(`<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Action de compte CodeQuest</title></head>
<body>
  <main>
    <h1>Action de compte CodeQuest</h1>
    <p id="status" role="status" aria-live="polite">Vérification du lien…</p>
    <form id="reset-form" hidden>
      <label for="new-password">Nouveau mot de passe (12 caractères minimum)</label>
      <input id="new-password" name="new-password" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required>
      <button type="submit">Réinitialiser</button>
    </form>
  </main>
  <script nonce="${nonce}">
    (() => {
      const status = document.getElementById('status');
      const form = document.getElementById('reset-form');
      const password = document.getElementById('new-password');
      const values = new URLSearchParams(location.hash.slice(1));
      const flow = values.get('flow');
      const token = values.get('token');
      history.replaceState(null, '', location.pathname);
      if (!token || (flow !== 'verify-email' && flow !== 'reset-password')) {
        status.textContent = 'Ce lien est invalide ou a expiré.';
        return;
      }
      const send = async (path, body) => fetch('/api/v1/auth/' + path, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (flow === 'verify-email') {
        send('verify-email', { token }).then((response) => {
          status.textContent = response.ok
            ? 'Adresse confirmée. Vous pouvez maintenant vous connecter.'
            : 'Ce lien est invalide ou a expiré.';
        }).catch(() => {
          status.textContent = 'Le service est temporairement indisponible.';
        });
        return;
      }
      status.textContent = 'Choisissez un nouveau mot de passe.';
      form.hidden = false;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button');
        submit.disabled = true;
        try {
          const response = await send('reset-password', {
            token,
            newPassword: password.value
          });
          status.textContent = response.ok
            ? 'Mot de passe modifié. Reconnectez-vous.'
            : 'Le lien ou le mot de passe est invalide, compromis, ou le service est indisponible.';
          if (response.ok) form.hidden = true;
        } catch {
          status.textContent = 'Le service est temporairement indisponible.';
        } finally {
          password.value = '';
          submit.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`);
  }

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  register(
    @Body() input: RegisterDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.auth.register(
      input,
      idempotencyKey ?? '',
      approximateIp(request),
    );
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() input: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(input.token);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(input.identifier, input.password, {
      userAgent: request.get('user-agent'),
      ipAddress: approximateIp(request),
    });
    return this.writeSessionCookies(session, response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.refresh(readCookie(request, REFRESH_COOKIE), {
      userAgent: request.get('user-agent'),
      ipAddress: approximateIp(request),
    });
    return this.writeSessionCookies(session, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, CsrfGuard)
  async logout(
    @Body() input: LogoutDto = {},
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      request.principal!.userId,
      request.principal!.sessionId,
      input.everywhere === true,
    );
    clearAuthCookies(response);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() input: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ status: 'accepted' }> {
    await this.auth.requestPasswordReset(
      input.email,
      approximateIp(request),
    );
    return { status: 'accepted' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() input: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(input.token, input.newPassword);
  }

  private writeSessionCookies(
    session: Awaited<ReturnType<AuthService['login']>>,
    response: Response,
  ) {
    appendCookie(
      response,
      ACCESS_COOKIE,
      session.accessToken,
      ACCESS_TTL_SECONDS,
    );
    appendCookie(
      response,
      REFRESH_COOKIE,
      session.refreshToken,
      REFRESH_TTL_SECONDS,
    );
    setCsrfCookie(response, session.csrfToken);

    return {
      user: session.user,
      permissions: session.permissions,
      expiresAt: session.accessExpiresAt.toISOString(),
    };
  }
}

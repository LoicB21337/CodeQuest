import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { clearAuthCookies } from '../auth/http-cookies';
import {
  DeleteMeDto,
  ListUsersQueryDto,
  UpdateMeDto,
} from '../auth/auth.dto';
import { AuthenticatedRequest } from '../auth/request-principal';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { UsersService } from './users.service';

@Controller('api/v1')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AccessTokenGuard)
  getMe(@Req() request: AuthenticatedRequest) {
    return this.users.getProfile(request.principal!.userId);
  }

  @Patch('me')
  @UseGuards(AccessTokenGuard, CsrfGuard)
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateMeDto,
  ) {
    if (!input.username) {
      return this.users.getProfile(request.principal!.userId);
    }
    return this.users.updateProfile(request.principal!.userId, input.username);
  }

  @Get('me/export')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  exportData(@Req() request: AuthenticatedRequest) {
    return this.users.exportPersonalData(request.principal!.userId);
  }

  @Get('me/sessions')
  @UseGuards(AccessTokenGuard)
  async listSessions(@Req() request: AuthenticatedRequest) {
    return {
      items: await this.users.listSessions(
        request.principal!.userId,
        request.principal!.sessionId,
      ),
    };
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, CsrfGuard)
  async revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.users.revokeSession(request.principal!.userId, sessionId);
    if (sessionId === request.principal!.sessionId) {
      clearAuthCookies(response);
    }
  }

  @Delete('me')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AccessTokenGuard, CsrfGuard)
  async requestDeletion(
    @Req() request: AuthenticatedRequest,
    @Body() input: DeleteMeDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const deletion = await this.users.requestDeletion(
      request.principal!.userId,
      input.password,
    );
    clearAuthCookies(response);
    return deletion;
  }

  @Get('admin/users')
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions('user:read')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.users.listUsers(query.cursor, query.limit);
  }
}

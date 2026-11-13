import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

@Injectable()
export class AccountDeletionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.purgeDueAccounts();
    }, 60 * 60 * 1000);
    this.timer.unref();
    void this.purgeDueAccounts();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async purgeDueAccounts(): Promise<void> {
    try {
      await this.users.purgeDueAccounts();
      const now = new Date();
      await this.prisma.idempotencyRecord.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      await this.prisma.loginThrottle.deleteMany({
        where: {
          lastFailureAt: {
            lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      });
    } catch {
      this.logger.error('Scheduled identity retention cleanup failed.');
    }
  }
}

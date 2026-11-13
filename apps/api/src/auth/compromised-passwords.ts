import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

@Injectable()
export class CompromisedPasswords {
  private hashes?: Promise<ReadonlySet<string>>;

  async assertNotCompromised(password: string): Promise<void> {
    const knownHashes = await this.loadHashes();
    const passwordHash = createHash('sha1').update(password, 'utf8').digest('hex');
    if (knownHashes.has(passwordHash)) {
      throw new BadRequestException({
        code: 'PASSWORD_COMPROMISED',
        message: 'Choose a password that is not known to be compromised.',
      });
    }
  }

  private loadHashes(): Promise<ReadonlySet<string>> {
    const configuredPath = process.env.COMPROMISED_PASSWORDS_FILE;
    if (!configuredPath) {
      throw new ServiceUnavailableException(
        'The compromised-password list is not configured.',
      );
    }

    if (!this.hashes) {
      this.hashes = readFile(configuredPath, 'utf8')
        .then((contents) => {
          if (Buffer.byteLength(contents, 'utf8') > 64 * 1024 * 1024) {
            throw new Error('Configured password list is too large.');
          }

          const lines = contents
            .split(/\r?\n/)
            .map((line) => line.trim().toLowerCase())
            .filter(Boolean);
          if (
            lines.length === 0 ||
            lines.some((line) => !/^[a-f0-9]{40}$/.test(line))
          ) {
            throw new Error('Configured password list is empty or invalid.');
          }
          return new Set(lines);
        })
        .catch(() => {
          this.hashes = undefined;
          throw new ServiceUnavailableException(
            'The compromised-password list is unavailable.',
          );
        });
    }
    return this.hashes;
  }
}

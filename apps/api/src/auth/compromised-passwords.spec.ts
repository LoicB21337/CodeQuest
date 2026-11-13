import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { resolve } from 'node:path';
import { CompromisedPasswords } from './compromised-passwords';

describe('CompromisedPasswords', () => {
  const originalPath = process.env.COMPROMISED_PASSWORDS_FILE;

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.COMPROMISED_PASSWORDS_FILE;
    } else {
      process.env.COMPROMISED_PASSWORDS_FILE = originalPath;
    }
  });

  it('rejects a password whose SHA-1 fingerprint is in the configured local list', async () => {
    process.env.COMPROMISED_PASSWORDS_FILE = resolve(
      __dirname,
      'test-fixtures/compromised-passwords.sha1',
    );
    const checker = new CompromisedPasswords();

    await expect(
      checker.assertNotCompromised('password123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      checker.assertNotCompromised('a password absent from the list'),
    ).resolves.toBeUndefined();
  });

  it('fails closed when no local list is configured', async () => {
    delete process.env.COMPROMISED_PASSWORDS_FILE;
    const checker = new CompromisedPasswords();

    await expect(
      checker.assertNotCompromised('some new password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed when any non-empty list entry is malformed', async () => {
    process.env.COMPROMISED_PASSWORDS_FILE = resolve(
      __dirname,
      'test-fixtures/invalid-compromised-passwords.sha1',
    );
    const checker = new CompromisedPasswords();

    await expect(
      checker.assertNotCompromised('some new password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

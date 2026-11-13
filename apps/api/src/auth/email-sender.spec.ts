import { ServiceUnavailableException } from '@nestjs/common';
import { SmtpEmailSender } from './email-sender';

describe('SmtpEmailSender', () => {
  const keys = [
    'MAIL_MODE',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_FROM',
    'PUBLIC_API_URL',
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('does not report successful delivery when SMTP is absent', async () => {
    for (const key of keys) {
      delete process.env[key];
    }
    const sender = new SmtpEmailSender();

    expect(() => sender.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
    await expect(
      sender.send({
        recipient: 'person@example.test',
        subject: 'Test',
        text: 'Not delivered',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

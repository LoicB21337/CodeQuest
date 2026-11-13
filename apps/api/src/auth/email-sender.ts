import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export interface OutboundEmail {
  recipient: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  assertConfigured(): void;
  publicApiOrigin(): string | undefined;
  send(email: OutboundEmail): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

@Injectable()
export class SmtpEmailSender implements EmailSender {
  assertConfigured(): void {
    if (
      process.env.MAIL_MODE !== 'smtp' ||
      !process.env.SMTP_HOST ||
      !this.smtpPort() ||
      !process.env.SMTP_FROM ||
      !this.publicApiOrigin() ||
      (process.env.NODE_ENV === 'production' &&
        process.env.SMTP_SECURE !== 'true')
    ) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured.',
      );
    }

    if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD)) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured.',
      );
    }
  }

  async send(email: OutboundEmail): Promise<void> {
    this.assertConfigured();
    const port = this.smtpPort();
    if (!port) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured.',
      );
    }

    const transport = createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true',
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    });

    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: email.recipient,
        subject: email.subject,
        text: email.text,
      });
    } catch {
      throw new ServiceUnavailableException('Email delivery is unavailable.');
    } finally {
      transport.close();
    }
  }

  publicApiOrigin(): string | undefined {
    const configured = process.env.PUBLIC_API_URL;
    if (!configured) {
      return undefined;
    }

    try {
      const url = new URL(configured);
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        return undefined;
      }
      return url.origin;
    } catch {
      return undefined;
    }
  }

  private smtpPort(): number | undefined {
    const port = Number(process.env.SMTP_PORT);
    return Number.isInteger(port) && port > 0 && port <= 65_535
      ? port
      : undefined;
  }
}

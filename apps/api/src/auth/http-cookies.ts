import type { Request, Response } from 'express';
import { isIP } from 'node:net';

export const ACCESS_COOKIE = '__Host-cq_access';
export const REFRESH_COOKIE = '__Host-cq_refresh';
export const CSRF_COOKIE = '__Host-cq_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function appendCookie(
  response: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
  httpOnly = true,
): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'Secure',
    'SameSite=Lax',
  ];
  if (httpOnly) {
    attributes.push('HttpOnly');
  }
  const existing = response.getHeader('Set-Cookie');
  const headers = existing
    ? Array.isArray(existing)
      ? existing.map(String)
      : [String(existing)]
    : [];
  headers.push(attributes.join('; '));
  response.setHeader('Set-Cookie', headers);
}

export function clearAuthCookies(response: Response): void {
  const expires = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  for (const [name, httpOnly] of [
    [ACCESS_COOKIE, true],
    [REFRESH_COOKIE, true],
    [CSRF_COOKIE, false],
  ] as const) {
    const existing = response.getHeader('Set-Cookie');
    const headers = existing
      ? Array.isArray(existing)
        ? existing.map(String)
        : [String(existing)]
      : [];
    headers.push(
      `${name}=; Path=/; Max-Age=0; ${expires}; Secure; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}`,
    );
    response.setHeader('Set-Cookie', headers);
  }
}

export function setCsrfCookie(response: Response, token: string): void {
  appendCookie(response, CSRF_COOKIE, token, REFRESH_TTL_SECONDS, false);
}

export function approximateIp(request: Request): string | null {
  const address = request.socket.remoteAddress;
  if (!address) {
    return null;
  }
  const normalized =
    address.startsWith('::ffff:') && isIP(address.slice(7)) === 4
      ? address.slice(7)
      : address;
  if (isIP(normalized) === 4) {
    const octets = normalized.split('.');
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  if (isIP(normalized) === 6) {
    const address = normalized.split('%')[0];
    const [leftPart, rightPart = ''] = address.split('::');
    const left = leftPart ? leftPart.split(':') : [];
    const right = rightPart ? rightPart.split(':') : [];
    const missingGroups = 8 - left.length - right.length;
    if (missingGroups < 0) {
      return null;
    }
    const groups = [
      ...left,
      ...Array.from({ length: missingGroups }, () => '0'),
      ...right,
    ];
    if (groups.length !== 8) {
      return null;
    }
    return `${groups
      .slice(0, 4)
      .map((group) => Number.parseInt(group || '0', 16).toString(16).padStart(4, '0'))
      .join(':')}::/64`;
  }
  return null;
}

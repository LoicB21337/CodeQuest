import type { Request } from 'express';

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  permissions: ReadonlySet<string>;
}

export interface AuthenticatedRequest extends Request {
  principal?: AuthenticatedPrincipal;
}

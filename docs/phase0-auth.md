# Phase 0 — API and identity foundations

The versioned contract is `apps/api/openapi/v1.yaml`. It specifies authentication
and administrative routes, bounded DTO validation, a common error envelope,
cursor pagination, registration idempotency, rate-limit responses, and
cookie/CSRF requirements. Runtime routes beyond the existing `GET /health`
remain unimplemented; the document is a contract, not a claim of availability.

## Identity and authorization

`apps/api/prisma/schema.prisma` and its initial migration establish users,
sessions, single-use action tokens, roles, permissions, and their join tables.
Passwords are hashed with Argon2id. Opaque random session/action tokens are
returned only to the caller and represented in storage by SHA-256 fingerprints.
The pure permission helper intentionally performs exact permission checks; role
assignment and permission loading remain persistence/application work.

The migration has a separate `rollback.sql`: Prisma Migrate does not support
automatically running down migrations. Review its destructive effect and back
up data before use.

## Security and release gates

- Never reveal whether an email address is registered. Registration and reset
  requests have indistinguishable accepted responses; login failures are
  generic. Never put passwords, raw tokens, cookies, or message bodies in logs.
- Production session cookies must be `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`, and host-only (`__Host-`, with no `Domain`). Require HTTPS and
  CSRF token plus same-origin checks for unsafe cookie-authenticated requests.
- Idempotency keys are scoped to a caller/operation, bound to the request
  fingerprint, and retained for 24 hours; conflicting reuse returns 409.
- Cursor pagination is opaque and bounded to 100 results.
- **Go-live is blocked until the institution reviews and validates applicable
  rules, policies, and operational procedures for minors and account data.**
  This implementation assumes no jurisdiction and makes no legal determination.

The provided implementation plan and a prior API specification were not present
in this worktree. This contract therefore uses only the task scope, the current
architecture document, and the scaffold's existing `/health` endpoint as inputs;
the institution/product owner must reconcile it with the authoritative plan
before enabling the new routes.

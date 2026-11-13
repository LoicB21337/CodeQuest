# Auth identity migrations

Apply with Prisma Migrate after `DATABASE_URL` is configured. The baseline
migration creates identity, session, action-token and RBAC tables; the
`20261113133000_auth_flows` migration adds usernames, account lifecycle,
refresh-token rotation, throttling and idempotency records, and seeds the
`player` and `administrator` roles with the `user:read` permission.

Each migration's `rollback.sql` is deliberately separate because Prisma Migrate
does not automatically execute down migrations. Before rollback, back up data,
confirm the destructive effects, and only run a rollback when that migration
is the latest applied migration. Rolling back `auth_flows` drops the new
columns/tables, including username values backfilled for pre-existing users;
it also removes seeded roles/permissions only when they are not assigned.

The database stores Argon2id password hashes and fingerprints of random opaque
session/action tokens; application code must normalize email addresses before
persistence and must never persist or log raw tokens. Migrations have only
been schema-validated in the development worktree; they have not been applied
to a live or test PostgreSQL server. The institution must validate and rehearse
apply/rollback procedures against a disposable PostgreSQL instance before
deployment.

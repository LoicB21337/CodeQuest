# Auth identity migration

Apply with Prisma Migrate after `DATABASE_URL` is configured. The corresponding
`rollback.sql` is deliberately separate because Prisma Migrate does not
automatically execute down migrations. Before rolling back, back up data and
confirm that dropping all identity/session/role records is acceptable; run the
rollback SQL only when the migration is the latest applied migration.

The database stores only Argon2id password hashes and SHA-256 fingerprints of
random opaque session/action tokens. Application code must normalize email
addresses before persistence and must never persist or log raw tokens.

ALTER TABLE "users"
    ADD COLUMN "username" VARCHAR(20),
    ADD COLUMN "username_normalized" VARCHAR(80),
    ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(6),
    ADD COLUMN "deletion_scheduled_at" TIMESTAMPTZ(6);

UPDATE "users"
SET "username" = 'user_' || substring(replace("id"::text, '-', '') from 1 for 15),
    "username_normalized" = 'user_' || substring(replace("id"::text, '-', '') from 1 for 15);

ALTER TABLE "users"
    ALTER COLUMN "username" SET NOT NULL,
    ALTER COLUMN "username_normalized" SET NOT NULL;

ALTER TABLE "sessions"
    ADD COLUMN "last_reauthenticated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "user_agent" VARCHAR(255),
    ADD COLUMN "ip_address" VARCHAR(64);

UPDATE "sessions"
SET "last_reauthenticated_at" = "created_at";

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_fingerprint" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "login_throttles" (
    "identifier_fingerprint" BYTEA NOT NULL,
    "user_id" UUID,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "blocked_until" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("identifier_fingerprint")
);

CREATE TABLE "idempotency_records" (
    "scope" VARCHAR(80) NOT NULL,
    "key_fingerprint" BYTEA NOT NULL,
    "request_fingerprint" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("scope", "key_fingerprint")
);

CREATE UNIQUE INDEX "users_username_normalized_key" ON "users"("username_normalized");
CREATE UNIQUE INDEX "refresh_tokens_token_fingerprint_key" ON "refresh_tokens"("token_fingerprint");
CREATE INDEX "refresh_tokens_session_id_expires_at_idx" ON "refresh_tokens"("session_id", "expires_at");
CREATE INDEX "login_throttles_blocked_until_idx" ON "login_throttles"("blocked_until");
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

INSERT INTO "refresh_tokens" ("id", "session_id", "token_fingerprint", "expires_at")
SELECT "id", "id", "token_fingerprint", "expires_at"
FROM "sessions"
WHERE "revoked_at" IS NULL AND "expires_at" > CURRENT_TIMESTAMP;

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "login_throttles"
    ADD CONSTRAINT "login_throttles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "code", "description")
VALUES
    ('00000000-0000-4000-8000-000000000001', 'player', 'Default verified account role'),
    ('00000000-0000-4000-8000-000000000002', 'administrator', 'Administrative permissions')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "permissions" ("id", "code", "description")
VALUES
    ('00000000-0000-4000-8000-000000000003', 'user:read', 'Read account directory')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role_row."id", permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'administrator'
  AND permission_row."code" = 'user:read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

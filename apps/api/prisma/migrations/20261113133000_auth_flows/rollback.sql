ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_session_id_fkey";
ALTER TABLE "login_throttles" DROP CONSTRAINT "login_throttles_user_id_fkey";

DELETE FROM "role_permissions" AS assignment
USING "roles" AS role_row, "permissions" AS permission_row
WHERE assignment."role_id" = role_row."id"
  AND assignment."permission_id" = permission_row."id"
  AND role_row."code" = 'administrator'
  AND permission_row."code" = 'user:read';

DELETE FROM "roles" AS role_row
WHERE role_row."code" IN ('player', 'administrator')
  AND NOT EXISTS (
    SELECT 1 FROM "user_roles" AS assignment
    WHERE assignment."role_id" = role_row."id"
  );

DELETE FROM "permissions" AS permission_row
WHERE permission_row."code" = 'user:read'
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" AS assignment
    WHERE assignment."permission_id" = permission_row."id"
  );

DROP TABLE "idempotency_records";
DROP TABLE "login_throttles";
DROP TABLE "refresh_tokens";

ALTER TABLE "sessions"
    DROP COLUMN "last_reauthenticated_at",
    DROP COLUMN "user_agent",
    DROP COLUMN "ip_address";

ALTER TABLE "users"
    DROP COLUMN "deletion_scheduled_at",
    DROP COLUMN "deletion_requested_at",
    DROP COLUMN "username_normalized",
    DROP COLUMN "username";

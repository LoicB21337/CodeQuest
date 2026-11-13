ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permission_id_fkey";
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_role_id_fkey";
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_fkey";
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_user_id_fkey";
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

DROP TABLE "role_permissions";
DROP TABLE "user_roles";
DROP TABLE "permissions";
DROP TABLE "roles";
DROP TABLE "auth_tokens";
DROP TABLE "sessions";
DROP TABLE "users";

DROP TYPE "AuthTokenPurpose";
DROP TYPE "UserStatus";

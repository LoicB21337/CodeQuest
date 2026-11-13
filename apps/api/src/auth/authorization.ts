export interface PermissionPrincipal {
  permissions: ReadonlySet<string>;
}

export function hasPermission(
  principal: PermissionPrincipal,
  requiredPermission: string,
): boolean {
  return principal.permissions.has(requiredPermission);
}

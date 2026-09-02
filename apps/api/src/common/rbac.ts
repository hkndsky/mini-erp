import type { Role } from '@prisma/client';

/**
 * RBAC helpers.
 *
 * ADMIN and WAREHOUSE share the "operations" capability set; SALES is the
 * read-mostly role. The same predicates are mirrored in the frontend so both
 * layers enforce the same matrix (defense in depth).
 */
export type ApiRole = Role | 'ADMIN' | 'WAREHOUSE' | 'SALES';

export function canViewCosts(role: ApiRole): boolean {
  return role !== 'SALES';
}

export function canManageInventory(role: ApiRole): boolean {
  return role !== 'SALES';
}

export function canResolveConflicts(role: ApiRole): boolean {
  return role !== 'SALES';
}

export function canManageSuppliers(role: ApiRole): boolean {
  return role !== 'SALES';
}

export function canManageOrders(role: ApiRole): boolean {
  return role !== 'SALES';
}

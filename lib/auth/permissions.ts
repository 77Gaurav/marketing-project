import type { UserRole } from '@/lib/db/types';

/**
 * Role-based access control, expressed as data.
 *
 * There are exactly three roles, declared once on `users.role` as a PostgreSQL enum. Which of them
 * may do what lives here, in a literal map, so a route asks `can(role, 'campaign:create')` instead of
 * growing an `if (role === ...)` chain. Nothing reads this map at runtime to make a decision that is
 * not in it — an unknown role fails closed.
 *
 * Deliberately not enforced at the database level yet. Row-level security is the right tool once
 * admins exist and the same query has to return different rows per role, and doing it now would mean
 * two sources of truth for the same rule.
 */
export const PERMISSIONS = {
  'campaign:create': ['BRAND', 'ADMIN'],
  'campaign:read:any': ['ADMIN'],
  'brand:manage': ['BRAND', 'ADMIN'],
  'store:manage': ['STORE', 'ADMIN'],
  'user:manage': ['ADMIN'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}
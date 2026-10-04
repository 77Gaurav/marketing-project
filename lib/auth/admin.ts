import { timingSafeEqual } from 'node:crypto';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { getPool, isUniqueViolation } from '@/lib/db/pool';
import { createUser, findUserByEmail } from '@/lib/db/repositories/users';
import { getServerEnv } from '@/lib/env';
import type { User } from '@/lib/db/types';

/**
 * Admin console authorisation.
 *
 * Two halves, deliberately separated:
 *
 *   * {@link verifyAdminCredentials} — is this the operator? Compares against the environment.
 *   * {@link requireAdminSession} — is this request acting as an admin? Reads the signed session
 *     cookie and the role from the database.
 *
 * Login mints an ordinary `st_session` cookie for an ADMIN `users` row rather than inventing a
 * second kind of session for the console. That means one session format, one expiry rule and one
 * logout path, and — because the role is read from the database on every request — demoting the
 * account takes effect immediately instead of at the end of a token's life.
 *
 * Known limitation, stated plainly: the credential is a shared secret checked from the environment,
 * with no per-user identity, no password hashing and no rate limiting on the login route. That is
 * adequate for an internal console on a fresh build and not adequate for a public deployment. The
 * fix is to move the credential onto the `users` row as a hash and let the rest of this file be
 * deleted in favour of the existing session machinery; nothing above it would change.
 */

/** Length of the shortest password accepted, for the reason given in lib/env.ts. */
const MIN_PRODUCTION_PASSWORD_LENGTH = 12;

/**
 * Constant-time comparison of two strings.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is compared first and a
 * mismatch returns false. That does leak the length of the expected value — unavoidable with this
 * primitive, and a far smaller leak than the character-by-character timing `===` would expose on a
 * login form.
 */
function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');

  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

/**
 * Whether the submitted credentials match the configured admin account.
 *
 * Both comparisons always run, whatever the first one returns. An implementation that short-circuits
 * on the username would let an attacker measure how long a wrong username takes versus a wrong
 * password, which turns the password space from "unbounded" to "only the usernames that exist".
 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  const env = getServerEnv();

  const usernameMatches =
    safeEqual(username, env.adminUsername) ||
    (process.env.NODE_ENV !== 'production' && safeEqual(username, DEFAULT_ADMIN_USERNAME));
  const passwordMatches =
    safeEqual(password, env.adminPassword) ||
    (process.env.NODE_ENV !== 'production' && safeEqual(password, DEFAULT_ADMIN_PASSWORD));

  return usernameMatches && passwordMatches;
}

/** True when the configured password is one that must never reach a real deployment. */
export function adminPasswordIsWeak(): boolean {
  const env = getServerEnv();
  return env.adminPassword === 'admin' || env.adminPassword.length < MIN_PRODUCTION_PASSWORD_LENGTH;
}

export class AdminAccountConflictError extends Error {
  readonly email: string;
  readonly actualRole: User['role'];

  constructor(email: string, actualRole: User['role']) {
    super(`Account ${email} exists with role ${actualRole}`);
    this.name = 'AdminAccountConflictError';
    this.email = email;
    this.actualRole = actualRole;
  }
}

/**
 * The ADMIN account behind the console, created on first login if it does not exist.
 *
 * The role of an existing account is never changed, for the same reason `ensureBrandUser` does not
 * change one: an ADMIN whose address is also used as a brand contact must stay an ADMIN. Where the
 * address already belongs to a non-ADMIN the login is refused outright rather than silently promoted
 * or demoted — promoting it would hand console access to whoever registered that address, and
 * demoting it would lock out the operator.
 */
export async function ensureAdminUser(db = getPool()): Promise<User> {
  const env = getServerEnv();

  const existing = await findUserByEmail(db, env.adminEmail);
  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new AdminAccountConflictError(existing.email, existing.role);
    }
    return existing;
  }

  try {
    return await createUser(db, {
      email: env.adminEmail,
      fullName: env.adminName,
      phone: null,
      role: 'ADMIN',
    });
  } catch (error) {
    // Two first logins at once both see no row; the loser adopts the winner's rather than 500-ing.
    if (isUniqueViolation(error)) {
      const raced = await findUserByEmail(db, env.adminEmail);
      if (raced) {
        if (raced.role !== 'ADMIN') throw new AdminAccountConflictError(raced.email, raced.role);
        return raced;
      }
    }
    throw error;
  }
}

export type AdminGuardFailure = {
  ok: false;
  status: 401 | 403;
  /** Safe to show a user. Never a message from PostgreSQL or the driver. */
  error: string;
};

export type AdminGuardSuccess = {
  ok: true;
  admin: User;
};

export type AdminGuardResult = AdminGuardSuccess | AdminGuardFailure;

/**
 * Authorise a request against the console.
 *
 * Returns the resolved result rather than throwing, so each route can turn it into a status code in
 * one line. The distinction between 401 and 403 is deliberate and worth keeping: a caller with no
 * session is told to sign in, and a signed-in caller with the wrong role is told it is not allowed —
 * collapsing them into one status would make a broken cookie indistinguishable from a missing
 * permission, which are very different bugs.
 */
export async function requireAdminSession(): Promise<AdminGuardResult> {
  const actor = await getSessionUser();

  if (!actor) {
    return { ok: false, status: 401, error: 'Sign in to the admin console to continue.' };
  }

  if (!can(actor.role, 'user:manage')) {
    return { ok: false, status: 403, error: 'That account cannot manage the network.' };
  }

  return { ok: true, admin: actor };
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getServerEnv, isDevelopment } from '@/lib/env';
import { getPool } from '@/lib/db/pool';
import { findUserByEmail, findUserById } from '@/lib/db/repositories/users';
import type { User } from '@/lib/db/types';

/**
 * Session resolution.
 *
 * This project has no auth provider yet, so this module is the single seam that one will replace.
 * Everything above it — routes, services, pages — calls `getSessionUser()` and gets a `User | null`,
 * and nothing above it knows how the identity was established. Swapping in Auth.js, Clerk or a
 * hand-rolled login later is a change to this file and to the cookie helpers at the bottom.
 *
 * Resolution order:
 *   1. a signed session cookie
 *   2. DEV_AUTH_EMAIL, outside production only, so the flow is reachable before auth exists
 *   3. null — the caller decides whether that is a 401 or a bootstrap
 *
 * The cookie carries only a subject and an issued-at. The role is read from the database on every
 * request rather than encoded in the token, so suspending an admin takes effect immediately instead
 * of when their cookie happens to expire.
 */

export const SESSION_COOKIE = 'st_session';

/** Sessions older than this are rejected. Sliding this is a one-line change. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

interface SessionPayload {
  /** User id. */
  sub: string;
  /** Issued-at, epoch seconds. */
  iat: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** Produce the cookie value for a user. Exported so a future login route can issue one. */
export function createSessionToken(userId: string, secret: string): string {
  const payload: SessionPayload = { sub: userId, iat: Math.floor(Date.now() / 1000) };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verify and decode a cookie value. Returns null for anything malformed or wrongly signed.
 *
 * The signature comparison is length-checked before `timingSafeEqual`, which throws on a length
 * mismatch — without that check a tampered cookie is a crash rather than a rejection.
 */
export function readSessionToken(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(sign(body, secret));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch {
    return null;
  }

  if (typeof payload?.sub !== 'string' || typeof payload?.iat !== 'number') return null;

  const age = Math.floor(Date.now() / 1000) - payload.iat;
  if (age < 0 || age > SESSION_MAX_AGE_SECONDS) return null;

  return payload;
}

/**
 * The current user, or null.
 *
 * Reads the role from the database on every call. That is one indexed primary-key lookup on a row
 * that is almost certainly in the page cache, and it buys the property that a role change takes
 * effect on the next request instead of at the end of a token's life.
 */
export async function getSessionUser(): Promise<User | null> {
  const env = getServerEnv();

  const token = cookies().get(SESSION_COOKIE)?.value;
  const payload = readSessionToken(token, env.sessionSecret);
  if (payload) return findUserById(getPool(), payload.sub);

  if (isDevelopment() && env.devAuthEmail) {
    return findUserByEmail(getPool(), env.devAuthEmail);
  }

  return null;
}
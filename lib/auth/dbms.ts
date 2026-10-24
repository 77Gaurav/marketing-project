import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env';

/**
 * DBMS Console Authentication & Session Management.
 *
 * Secures the /admin/dbms relational database schema & records explorer.
 * Accepts database administrator credentials configured in the environment:
 * - PostgreSQL user/password (POSTGRES_USER / POSTGRES_PASSWORD or DATABASE_URL)
 * - Admin credentials (ADMIN_USERNAME / ADMIN_PASSWORD)
 */

export const DBMS_COOKIE = 'st_dbms_session';
export const DBMS_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');

  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Verify whether the submitted username and password match the separate DBMS credentials managed in .env.
 */
export function verifyDbmsCredentials(username: string, password: string): boolean {
  const env = getServerEnv();

  const usernameMatches = safeEqual(username, env.dbmsUsername);
  const passwordMatches = safeEqual(password, env.dbmsPassword);

  return usernameMatches && passwordMatches;
}

interface DbmsSessionPayload {
  sub: string;
  role: 'dbms_admin';
  iat: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createDbmsToken(username: string): string {
  const env = getServerEnv();
  const payload: DbmsSessionPayload = {
    sub: username,
    role: 'dbms_admin',
    iat: Math.floor(Date.now() / 1000),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, env.sessionSecret)}`;
}

export function verifyDbmsToken(token: string | undefined): DbmsSessionPayload | null {
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const env = getServerEnv();
  const expectedSignature = sign(body, env.sessionSecret);

  const sigBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expectedSignature, 'utf8');
  if (sigBytes.length !== expectedBytes.length) return null;
  if (!timingSafeEqual(sigBytes, expectedBytes)) return null;

  try {
    const raw = Buffer.from(body, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as DbmsSessionPayload;
    if (parsed.role !== 'dbms_admin') return null;
    const age = Math.floor(Date.now() / 1000) - parsed.iat;
    if (age > DBMS_MAX_AGE_SECONDS || age < -60) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function dbmsCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DBMS_MAX_AGE_SECONDS,
  };
}

export async function isDbmsAuthenticated(): Promise<{ authenticated: boolean; user?: string }> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(DBMS_COOKIE)?.value;
    const verified = verifyDbmsToken(token);
    if (verified) {
      return { authenticated: true, user: verified.sub };
    }
  } catch {
    // cookies() unavailable outside request context
  }
  return { authenticated: false };
}

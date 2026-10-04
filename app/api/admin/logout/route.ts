import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

/**
 * POST /api/admin/logout — drop the session.
 *
 * No guard: signing out has to work whether or not the caller is currently signed in, otherwise a
 * stale cookie leaves the console unreachable until it expires on its own. The clear is done by
 * `sessionCookieOptions`, which reuses the exact attributes the cookie was set with — a browser matches
 * on name *and* path, so a clear with a narrower path leaves the original in place.
 *
 * One shared session across /admin and the brand dashboard, so this signs out of both.
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

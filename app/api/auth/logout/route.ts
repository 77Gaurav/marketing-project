import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

/**
 * POST /api/auth/logout — drop the session.
 *
 * The dashboard's sign-out, deliberately sharing `st_session` with `/api/admin/logout` rather than
 * minting a second session format: one cookie, one expiry rule, one thing to revoke. Signing out here
 * also signs out of /admin, which is correct — there is one identity, not one per screen.
 *
 * No guard, exactly as in the admin route: signing out has to work whether or not the caller is
 * currently signed in, or a stale cookie leaves the dashboard unreachable until it expires on its own.
 * That is also why this is POST — a GET sign-out can be triggered by any image tag on any page.
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
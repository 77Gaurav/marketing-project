import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * POST /api/admin/logout — drop the session.
 *
 * No guard: signing out has to work whether or not the caller is currently signed in, otherwise a
 * stale cookie leaves the console unreachable until it expires on its own. The cookie is cleared with
 * the same attributes it was set with, because a browser matches on name *and* path, and a clear with
 * a narrower path leaves the original in place.
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  cookies().delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

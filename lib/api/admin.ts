import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/admin';
import type { User } from '@/lib/db/types';

/**
 * Request plumbing shared by the admin routes.
 *
 * Every `/api/admin/*` route needs the same three things in the same order: refuse a caller who is not
 * an admin, turn an infrastructure fault into a 503, and make sure no driver message ever reaches a
 * browser. Expressing that once here means each route file is left holding only its own logic, and
 * means a new admin route cannot forget the third part by being written in a hurry.
 *
 * Routes return `NextResponse` from inside the callback and nothing else; the guard and the error
 * handling are not the route's concern.
 */

interface ErrorBody {
  error: string;
  /** Per-field messages, present only on a 422. */
  fields?: Record<string, string>;
}

export function errorResponse(body: ErrorBody, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * Run `handler` as an authenticated admin, or answer with the reason it could not run.
 *
 * The 401 and 403 are kept distinct: no session is a sign-in problem, the wrong role is a permission
 * problem, and reporting both as one status makes a dropped cookie indistinguishable from a
 * misconfigured role.
 */
export async function withAdmin(
  handler: (admin: User) => Promise<NextResponse>,
): Promise<NextResponse> {
  let guard;
  try {
    guard = await requireAdminSession();
  } catch (error) {
    // No session lookup means no database round trip, so this is a real fault rather than a refusal.
    console.error('[admin] identity resolution failed', error);
    return errorResponse({ error: 'Could not verify your session. Try again shortly.' }, 503);
  }

  if (!guard.ok) {
    return errorResponse({ error: guard.error }, guard.status);
  }

  return handler(guard.admin);
}

/**
 * Parse a JSON body, reporting a malformed one as a 400 rather than letting it throw.
 *
 * `request.json()` rejects on a truncated or empty body, and an unhandled rejection here is a 500 that
 * tells the caller nothing they can fix.
 */
export async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

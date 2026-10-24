import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/admin';
import type { User } from '@/lib/db/types';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

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
 *
 * Automatically instrumented with Pydantic Logfire:
 * Creates root trace & span `admin.api: {method} {path}`, child span for admin auth session,
 * and child span for route handler execution, logging processing, success, and failure lifecycles.
 */
export async function withAdmin(
  handlerOrRequest: ((admin: User) => Promise<NextResponse>) | Request,
  maybeHandler?: (admin: User) => Promise<NextResponse>,
): Promise<NextResponse> {
  const req = typeof handlerOrRequest === 'function' ? undefined : handlerOrRequest;
  const handler = typeof handlerOrRequest === 'function' ? handlerOrRequest : maybeHandler!;

  let path = '/api/admin';
  let method = req ? req.method : 'GET';

  if (req) {
    try {
      path = new URL(req.url).pathname;
    } catch {}
  } else {
    try {
      const { headers } = require('next/headers');
      const h = headers();
      path = h.get('x-url') || h.get('x-invoke-path') || h.get('next-url') || '/api/admin';
      method = h.get('x-method') || 'GET';
    } catch {}
  }

  return await traceAdminRequest(
    {
      name: `admin.api: ${method} ${path}`,
      method,
      path,
      request: req,
    },
    async () => {
      let guard;
      try {
        guard = await traceAdminChildSpan('admin.auth.session', { path }, async () => {
          return await requireAdminSession();
        });
      } catch (error) {
        logAdminError('[admin] identity resolution failed', error, { path });
        return errorResponse({ error: 'Could not verify your session. Try again shortly.' }, 503);
      }

      if (!guard.ok) {
        logAdminWarn(`[admin] access denied: ${guard.error}`, { path, status: guard.status });
        return errorResponse({ error: guard.error }, guard.status);
      }

      logAdminInfo('[admin] admin session verified', {
        path,
        adminId: guard.admin.id,
        adminEmail: guard.admin.email,
        adminRole: guard.admin.role,
      });

      return await traceAdminChildSpan(
        `admin.handler: ${method} ${path}`,
        {
          path,
          adminId: guard.admin.id,
          adminEmail: guard.admin.email,
        },
        async () => {
          return await handler(guard.admin);
        },
      );
    },
  );
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

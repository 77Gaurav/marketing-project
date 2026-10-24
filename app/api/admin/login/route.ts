import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  AdminAccountConflictError,
  adminPasswordIsWeak,
  ensureAdminUser,
  verifyAdminCredentials,
} from '@/lib/auth/admin';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth/session';
import { errorResponse, readJsonBody } from '@/lib/api/admin';
import { getServerEnv } from '@/lib/env';
import { adminCredentialsSchema, fieldErrorsFrom } from '@/lib/validation/admin';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

/**
 * POST /api/admin/login — exchange credentials for a session.
 *
 * On success this mints the same signed `st_session` cookie the rest of the product uses, for an ADMIN
 * row in `users`. No second session format, so `/admin` authorises through exactly the same code as
 * every other route and a role change takes effect on the next request.
 *
 * The failure response is deliberately uniform: a wrong username and a wrong password both produce the
 * same 401 with the same body, so the form cannot be used to discover which usernames exist.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: POST /api/admin/login',
      method: 'POST',
      path: '/api/admin/login',
      request,
    },
    async () => {
      const body = await readJsonBody(request);
      if (!body.ok) {
        logAdminWarn('[admin/login] Malformed request body');
        return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
      }

      const parsed = adminCredentialsSchema.safeParse(body.value);
      if (!parsed.success) {
        logAdminWarn('[admin/login] Validation failure on credentials format');
        return errorResponse(
          { error: 'Some details need fixing.', fields: fieldErrorsFrom(parsed.error) },
          422,
        );
      }

      const { username, password } = parsed.data;

      const isValid = await traceAdminChildSpan(
        'admin.auth.verify_credentials',
        { username },
        async () => {
          return verifyAdminCredentials(username, password);
        },
      );

      if (!isValid) {
        logAdminWarn('[admin/login] Authentication failed: invalid credentials', { username });
        return errorResponse({ error: 'That username or password is not right.' }, 401);
      }

      let admin;
      try {
        admin = await traceAdminChildSpan('admin.auth.ensure_user', { username }, async () => {
          return await ensureAdminUser();
        });
      } catch (error) {
        if (
          error instanceof AdminAccountConflictError ||
          (error instanceof Error && error.name === 'AdminAccountConflictError')
        ) {
          const conflict = error as AdminAccountConflictError;
          logAdminError('[admin] configured admin email is not an ADMIN account', error, {
            email: conflict.email,
            role: conflict.actualRole,
          });
          return errorResponse(
            { error: 'The admin console is misconfigured. Ask whoever set it up to check ADMIN_EMAIL.' },
            500,
          );
        }
        logAdminError('[admin/login] Login failed due to unexpected error', error);
        return errorResponse({ error: 'Could not sign you in. Try again shortly.' }, 503);
      }

      logAdminInfo('[admin/login] Login successful', {
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      const { sessionSecret } = getServerEnv();
      const response = NextResponse.json({
        admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
        warning: adminPasswordIsWeak()
          ? 'This console is using the default development password. Set ADMIN_PASSWORD before deploying.'
          : undefined,
      });

      response.cookies.set(
        SESSION_COOKIE,
        createSessionToken(admin.id, sessionSecret),
        sessionCookieOptions(),
      );

      return response;
    },
  );
}

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
  const body = await readJsonBody(request);
  if (!body.ok) {
    return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = adminCredentialsSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse(
      { error: 'Some details need fixing.', fields: fieldErrorsFrom(parsed.error) },
      422,
    );
  }

  const { username, password } = parsed.data;

  if (!verifyAdminCredentials(username, password)) {
    return errorResponse({ error: 'That username or password is not right.' }, 401);
  }

  let admin;
  try {
    admin = await ensureAdminUser();
  } catch (error) {
    if (error instanceof AdminAccountConflictError) {
      // The configured ADMIN_EMAIL belongs to an account with another role. Refusing is the only safe
      // answer: promoting it would hand console access to whoever registered that address.
      console.error('[admin] configured admin email is not an ADMIN account', {
        email: error.email,
        role: error.actualRole,
      });
      return errorResponse(
        { error: 'The admin console is misconfigured. Ask whoever set it up to check ADMIN_EMAIL.' },
        500,
      );
    }
    console.error('[admin] login failed', error);
    return errorResponse({ error: 'Could not sign you in. Try again shortly.' }, 503);
  }

  const { sessionSecret } = getServerEnv();
  cookies().set(
    SESSION_COOKIE,
    createSessionToken(admin.id, sessionSecret),
    sessionCookieOptions(),
  );

  return NextResponse.json({
    admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
    // Surfaced rather than logged: the console shows a warning while the credential is still the
    // development default, which is the moment anyone is likely to be told about it.
    warning: adminPasswordIsWeak()
      ? 'This console is using the default development password. Set ADMIN_PASSWORD before deploying.'
      : undefined,
  });
}

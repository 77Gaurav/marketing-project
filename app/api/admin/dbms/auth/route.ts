import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  DBMS_COOKIE,
  createDbmsToken,
  dbmsCookieOptions,
  isDbmsAuthenticated,
  verifyDbmsCredentials,
} from '@/lib/auth/dbms';
import { readJsonBody } from '@/lib/api/admin';
import { traceAdminRequest, logAdminInfo, logAdminWarn } from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dbms/auth
 * Check if the user is authenticated with the DBMS session.
 */
export async function GET(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: GET /api/admin/dbms/auth',
      method: 'GET',
      path: '/api/admin/dbms/auth',
      request,
    },
    async () => {
      const status = await isDbmsAuthenticated();
      return NextResponse.json(status);
    },
  );
}

/**
 * POST /api/admin/dbms/auth
 * Authenticate with DB admin username and password.
 */
export async function POST(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: POST /api/admin/dbms/auth',
      method: 'POST',
      path: '/api/admin/dbms/auth',
      request,
    },
    async () => {
      const bodyRes = await readJsonBody(request);
      if (!bodyRes.ok) {
        logAdminWarn('[admin/dbms/auth] Malformed request body');
        return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
      }

      const { username, password } = (bodyRes.value as Record<string, any>) ?? {};

      if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
        logAdminWarn('[admin/dbms/auth] Missing username or password');
        return NextResponse.json(
          { error: 'Both DB admin username and password are required.' },
          { status: 400 },
        );
      }

      const isValid = verifyDbmsCredentials(username.trim(), password);

      if (!isValid) {
        logAdminWarn('[admin/dbms/auth] DBMS authentication failed: invalid credentials', {
          username: username.trim(),
        });
        return NextResponse.json(
          { error: 'Invalid DB admin username or password.' },
          { status: 401 },
        );
      }

      logAdminInfo('[admin/dbms/auth] DBMS authentication successful', { user: username.trim() });
      const token = createDbmsToken(username.trim());
      const response = NextResponse.json({
        success: true,
        message: 'DB admin authentication successful.',
        user: username.trim(),
      });

      response.cookies.set(DBMS_COOKIE, token, dbmsCookieOptions());
      return response;
    },
  );
}

/**
 * DELETE /api/admin/dbms/auth
 * Sign out / lock the DBMS console.
 */
export async function DELETE(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: DELETE /api/admin/dbms/auth',
      method: 'DELETE',
      path: '/api/admin/dbms/auth',
      request,
    },
    async () => {
      const response = NextResponse.json({
        success: true,
        message: 'Signed out of DBMS console.',
      });

      response.cookies.set(DBMS_COOKIE, '', {
        ...dbmsCookieOptions(),
        maxAge: 0,
      });

      logAdminInfo('[admin/dbms/auth] Signed out of DBMS console');
      return response;
    },
  );
}

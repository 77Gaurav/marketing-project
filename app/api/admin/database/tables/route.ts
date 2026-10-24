import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/admin';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { isDbmsAuthenticated } from '@/lib/auth/dbms';
import { getPool } from '@/lib/db/pool';
import { listAllTables } from '@/lib/db/repositories/database-explorer';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/database/tables
 * Lists all public tables, row counts, and column counts for the admin and DBMS GUI.
 */
export async function GET(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: GET /api/admin/database/tables',
      method: 'GET',
      path: '/api/admin/database/tables',
      request,
    },
    async () => {
      const dbms = await isDbmsAuthenticated();
      let authorized = dbms.authenticated;

      if (!authorized) {
        try {
          const user = await getSessionUser();
          if (user && can(user.role, 'db:manage')) authorized = true;
        } catch {}
      }

      if (!authorized) {
        logAdminWarn('[admin/database/tables] Access denied');
        return errorResponse(
          { error: 'You do not have permission to view database tables. Please authenticate.' },
          403,
        );
      }

      try {
        const tables = await traceAdminChildSpan('admin.db.listAllTables', {}, async () => {
          return await listAllTables(getPool());
        });

        logAdminInfo('[admin/database/tables] Tables listed', { count: tables.length });
        return NextResponse.json({ tables });
      } catch (error) {
        logAdminError('[admin/database/tables] Failed to list tables', error);
        return errorResponse({ error: 'Failed to inspect database tables.' }, 500);
      }
    },
  );
}

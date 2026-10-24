import { NextResponse } from 'next/server';
import { isDbmsAuthenticated } from '@/lib/auth/dbms';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { getDatabaseRelationalSchema } from '@/lib/db/repositories/database-explorer';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dbms/schema
 * Returns the relational database schema, tables, columns, primary keys, and foreign key relationships.
 */
export async function GET(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: GET /api/admin/dbms/schema',
      method: 'GET',
      path: '/api/admin/dbms/schema',
      request,
    },
    async () => {
      const dbmsAuth = await isDbmsAuthenticated();
      let hasAccess = dbmsAuth.authenticated;

      if (!hasAccess) {
        try {
          const sessionUser = await getSessionUser();
          if (sessionUser && can(sessionUser.role, 'db:manage')) {
            hasAccess = true;
          }
        } catch {
          // not logged in
        }
      }

      if (!hasAccess) {
        logAdminWarn('[admin/dbms/schema] Unauthorized access attempt');
        return NextResponse.json(
          { error: 'Authentication required. Please enter DB admin credentials.' },
          { status: 401 },
        );
      }

      try {
        const schema = await traceAdminChildSpan('admin.db.getRelationalSchema', {}, async () => {
          const db = getPool();
          return await getDatabaseRelationalSchema(db);
        });

        logAdminInfo('[admin/dbms/schema] Schema loaded successfully', {
          tableCount: schema?.tables?.length ?? 0,
        });

        return NextResponse.json({ schema });
      } catch (error: any) {
        logAdminError('[api/admin/dbms/schema] Error loading relational schema', error);
        return NextResponse.json(
          { error: 'Failed to inspect relational schema: ' + (error?.message || '') },
          { status: 500 },
        );
      }
    },
  );
}

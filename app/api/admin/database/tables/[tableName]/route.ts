import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/admin';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { isDbmsAuthenticated } from '@/lib/auth/dbms';
import { getPool } from '@/lib/db/pool';
import { getTableRecords } from '@/lib/db/repositories/database-explorer';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    tableName: string;
  };
}

/**
 * GET /api/admin/database/tables/[tableName]
 * Fetches schema columns, primary key, and paginated rows for the requested table.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { tableName } = params;
  return await traceAdminRequest(
    {
      name: `admin.api: GET /api/admin/database/tables/${tableName}`,
      method: 'GET',
      path: `/api/admin/database/tables/${tableName}`,
      request,
      attributes: { tableName },
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
        logAdminWarn('[admin/database/tables] Access denied to table', { tableName });
        return errorResponse(
          { error: 'You do not have permission to view database tables.' },
          403,
        );
      }

      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') ?? '1', 10);
      const limit = parseInt(url.searchParams.get('limit') ?? '25', 10);
      const sortBy = url.searchParams.get('sortBy') ?? undefined;
      const sortOrder = (url.searchParams.get('sortOrder')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as
        | 'ASC'
        | 'DESC';

      try {
        const detail = await traceAdminChildSpan(
          `admin.db.getTableRecords:${tableName}`,
          { tableName, page, limit, sortBy, sortOrder },
          async () => {
            return await getTableRecords(getPool(), tableName, {
              page: isNaN(page) ? 1 : page,
              limit: isNaN(limit) ? 25 : limit,
              sortBy,
              sortOrder,
            });
          },
        );

        if (!detail) {
          logAdminWarn(`[admin/database/tables/${tableName}] Table not found`, { tableName });
          return errorResponse(
            { error: `Table "${tableName}" does not exist in the public schema.` },
            404,
          );
        }

        logAdminInfo(`[admin/database/tables/${tableName}] Records loaded`, {
          tableName,
          totalRows: detail.totalRows,
          returned: detail.rows.length,
        });

        return NextResponse.json(detail);
      } catch (error) {
        logAdminError(`[admin/database/tables/${tableName}] Failed to read records`, error, {
          tableName,
        });
        return errorResponse({ error: `Failed to read records from table "${tableName}".` }, 500);
      }
    },
  );
}

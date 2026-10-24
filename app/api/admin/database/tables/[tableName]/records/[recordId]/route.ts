import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/admin';
import { can } from '@/lib/auth/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { isDbmsAuthenticated } from '@/lib/auth/dbms';
import { getPool } from '@/lib/db/pool';
import { deleteRecordByPrimaryKey } from '@/lib/db/repositories/database-explorer';
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
    recordId: string;
  };
}

/**
 * DELETE /api/admin/database/tables/[tableName]/records/[recordId]
 * Deletes a record from the specified table by its primary key.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { tableName, recordId } = params;
  return await traceAdminRequest(
    {
      name: `admin.api: DELETE /api/admin/database/tables/${tableName}/records/${recordId}`,
      method: 'DELETE',
      path: `/api/admin/database/tables/${tableName}/records/${recordId}`,
      request,
      attributes: { tableName, recordId },
    },
    async () => {
      const dbms = await isDbmsAuthenticated();
      let authorized = dbms.authenticated;

      if (!authorized) {
        try {
          const user = await getSessionUser();
          if (user && can(user.role, 'db:delete')) authorized = true;
        } catch {}
      }

      if (!authorized) {
        logAdminWarn('[admin/database/tables/record] Delete access denied', { tableName, recordId });
        return errorResponse(
          { error: 'You do not have permission to delete database records.' },
          403,
        );
      }

      if (!recordId) {
        return errorResponse({ error: 'Record identifier is required.' }, 400);
      }

      try {
        const result = await traceAdminChildSpan(
          `admin.db.deleteRecord:${tableName}`,
          { tableName, recordId },
          async () => {
            return await deleteRecordByPrimaryKey(getPool(), tableName, recordId);
          },
        );

        if (!result.success) {
          const status = result.error?.includes('not found') ? 404 : 409;
          logAdminWarn(`[admin/database/tables/record] Delete rejected: ${result.error}`, {
            tableName,
            recordId,
            status,
          });
          return errorResponse({ error: result.error ?? 'Could not delete record.' }, status);
        }

        logAdminInfo(`[admin/database/tables/record] Record deleted successfully`, {
          tableName,
          recordId,
        });

        return NextResponse.json({
          success: true,
          message: `Record ${recordId} deleted from table ${tableName}.`,
          table: tableName,
          id: recordId,
        });
      } catch (error) {
        logAdminError(
          `[admin/database/tables/${tableName}/records/${recordId}] Delete error`,
          error,
          { tableName, recordId },
        );
        return errorResponse(
          { error: 'Failed to delete record due to an unexpected server error.' },
          500,
        );
      }
    },
  );
}

import { NextResponse } from 'next/server';
import { withAdmin, errorResponse } from '@/lib/api/admin';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { deleteRecordByPrimaryKey } from '@/lib/db/repositories/database-explorer';

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
 * Only permitted for authenticated administrators with 'db:delete' permission.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  return withAdmin(async (admin) => {
    if (!can(admin.role, 'db:delete')) {
      return errorResponse({ error: 'You do not have permission to delete database records.' }, 403);
    }

    const { tableName, recordId } = params;

    if (!recordId) {
      return errorResponse({ error: 'Record identifier is required.' }, 400);
    }

    try {
      const result = await deleteRecordByPrimaryKey(getPool(), tableName, recordId);

      if (!result.success) {
        // If not found, return 404; if constraint error, return 409
        const status = result.error?.includes('not found') ? 404 : 409;
        return errorResponse({ error: result.error ?? 'Could not delete record.' }, status);
      }

      return NextResponse.json({
        success: true,
        message: `Record ${recordId} deleted from table ${tableName}.`,
        table: tableName,
        id: recordId,
      });
    } catch (error) {
      console.error(`[admin/database/tables/${tableName}/records/${recordId}] Delete error`, error);
      return errorResponse({ error: 'Failed to delete record due to an unexpected server error.' }, 500);
    }
  });
}

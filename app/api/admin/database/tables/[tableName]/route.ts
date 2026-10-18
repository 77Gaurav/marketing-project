import { NextResponse } from 'next/server';
import { withAdmin, errorResponse } from '@/lib/api/admin';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { getTableRecords } from '@/lib/db/repositories/database-explorer';

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
  return withAdmin(async (admin) => {
    if (!can(admin.role, 'db:manage')) {
      return errorResponse({ error: 'You do not have permission to view database tables.' }, 403);
    }

    const { tableName } = params;
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '25', 10);
    const sortBy = url.searchParams.get('sortBy') ?? undefined;
    const sortOrder = (url.searchParams.get('sortOrder')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';

    try {
      const detail = await getTableRecords(getPool(), tableName, {
        page: isNaN(page) ? 1 : page,
        limit: isNaN(limit) ? 25 : limit,
        sortBy,
        sortOrder,
      });

      if (!detail) {
        return errorResponse({ error: `Table "${tableName}" does not exist in the public schema.` }, 404);
      }

      return NextResponse.json(detail);
    } catch (error) {
      console.error(`[admin/database/tables/${tableName}] Failed to read records`, error);
      return errorResponse({ error: `Failed to read records from table "${tableName}".` }, 500);
    }
  });
}

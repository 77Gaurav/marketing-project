import { NextResponse } from 'next/server';
import { withAdmin, errorResponse } from '@/lib/api/admin';
import { can } from '@/lib/auth/permissions';
import { getPool } from '@/lib/db/pool';
import { listAllTables } from '@/lib/db/repositories/database-explorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/database/tables
 * Lists all public tables, row counts, and column counts for the admin GUI.
 */
export async function GET() {
  return withAdmin(async (admin) => {
    if (!can(admin.role, 'db:manage')) {
      return errorResponse({ error: 'You do not have permission to view database tables.' }, 403);
    }

    try {
      const tables = await listAllTables(getPool());
      return NextResponse.json({ tables });
    } catch (error) {
      console.error('[admin/database/tables] Failed to list tables', error);
      return errorResponse({ error: 'Failed to inspect database tables.' }, 500);
    }
  });
}

import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { findStoreById, updateStoreStatus } from '@/lib/db/repositories/stores';
import type { StoreStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/stores/deactivate
 *
 * Deactivates or changes the status of a store (venue).
 * If deactivating (PAUSED or CLOSED), any running activation is cleaned up.
 *
 * Request Body:
 *   {
 *     "storeId": "<uuid>",
 *     "status": "PAUSED" | "CLOSED" | "PENDING_REVIEW" | "ACTIVE" (optional, default "PAUSED")
 *   }
 */
export async function POST(request: Request) {
  return withAdmin(async () => {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    const storeId = body.storeId || body.store_id || body.id;
    let targetStatus: StoreStatus = (body.status as StoreStatus) || 'DEACTIVATED';
    if ((targetStatus as string) === 'PAUSED' || (targetStatus as string) === 'CLOSED') {
      targetStatus = 'DEACTIVATED';
    } else if ((targetStatus as string) === 'PENDING_REVIEW') {
      targetStatus = 'PENDING';
    }

    if (!storeId) {
      return errorResponse({ error: "Missing required parameter: 'storeId'." }, 400);
    }

    const validStatuses: StoreStatus[] = ['ACTIVE', 'PENDING', 'DEACTIVATED', 'PENDING_REVIEW', 'PAUSED', 'CLOSED'];
    if (!validStatuses.includes(targetStatus)) {
      return errorResponse(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        400,
      );
    }

    try {
      const db = getPool();
      const store = await findStoreById(db, storeId);
      if (!store) {
        return errorResponse({ error: 'Store not found.' }, 404);
      }

      let activationsDeleted = 0;
      if (targetStatus !== 'ACTIVE') {
        const { deleteRunningActivationsForStore } = await import('@/device_backend');
        activationsDeleted = await deleteRunningActivationsForStore(db, storeId);
      }

      const updated = await updateStoreStatus(db, storeId, targetStatus);

      return NextResponse.json(
        {
          success: true,
          message: targetStatus === 'PAUSED' || targetStatus === 'CLOSED'
            ? `Store '${store.name}' deactivated (${targetStatus}).`
            : `Store '${store.name}' status set to ${targetStatus}.`,
          store: updated,
          activationsDeleted,
        },
        { status: 200 },
      );
    } catch (error: any) {
      console.error('[api/admin/stores/deactivate] Error:', error);
      return errorResponse(
        { error: error?.message || 'Failed to update store status.' },
        500,
      );
    }
  });
}

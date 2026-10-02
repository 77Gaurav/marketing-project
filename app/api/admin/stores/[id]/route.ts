import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { deleteStore, findStoreById } from '@/lib/db/repositories/stores';

/**
 * DELETE /api/admin/stores/[id] — remove a venue.
 *
 * Much lighter than the equivalent brand delete: nothing references a store yet, because campaign
 * allocation is a later phase, so there is no history to take with it. It still asks for a typed
 * confirmation — the two-step protocol is identical to the brand route and an operator deleting from
 * two different tables should not have to learn two different rules — but there is no cascade to
 * describe, so the first response simply confirms the name and says how many screens leave the
 * network.
 *
 * When `campaign_allocations` is introduced this route has to change: either refuse to delete a venue
 * with history, or keep the row and move it to `store_status` CLOSED, which the enum already allows.
 */

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return withAdmin(async () => {
    if (!UUID_PATTERN.test(params.id)) {
      return errorResponse({ error: 'Not a valid store id.' }, 400);
    }

    const url = new URL(request.url);
    const confirmation = url.searchParams.get('confirm');

    try {
      const db = getPool();
      const store = await findStoreById(db, params.id);
      if (!store) {
        return errorResponse({ error: 'Store not found.' }, 404);
      }

      if (confirmation === null) {
        return NextResponse.json(
          {
            error: `Removing ${store.name} takes ${store.screenCount} screen${store.screenCount === 1 ? '' : 's'} out of the network.`,
            requiresConfirmation: true,
            store: { id: store.id, name: store.name, screenCount: store.screenCount },
          },
          { status: 409 },
        );
      }

      if (confirmation !== store.name) {
        return errorResponse(
          { error: 'The confirmation did not match the store name. Nothing was deleted.' },
          400,
        );
      }

      const deleted = await deleteStore(db, store.id);
      if (!deleted) {
        return errorResponse({ error: 'Store not found.' }, 404);
      }

      return NextResponse.json({
        deleted: true,
        storeId: store.id,
        screensRemoved: store.screenCount,
      });
    } catch (error) {
      console.error('[admin] store deletion failed', error);
      return errorResponse({ error: 'Could not delete this store.' }, 500);
    }
  });
}

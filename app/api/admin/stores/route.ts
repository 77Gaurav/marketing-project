import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { createStore, listStores } from '@/lib/db/repositories/stores';
import { adminStoreSchema, fieldErrorsFrom } from '@/lib/validation/admin';

/**
 * GET  /api/admin/stores — every venue, largest inventory first.
 * POST /api/admin/stores — add a venue.
 *
 * The list is the network's supply side in one view: name, where it is, and how many screens it
 * contributes. Those last two are the columns added in db/migrations/0003, and they are the ones an
 * operator asked for when they wanted to see the network at a glance rather than a list of trading
 * names.
 *
 * As with brands, adding a store does not create an account. `owner_user_id` stays NULL and the venue
 * is reachable on its contact email.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return withAdmin(async () => {
    try {
      const stores = await listStores(getPool());
      return NextResponse.json({
        stores,
        total: stores.length,
        // The network's total inventory, so the console header does not have to add it up in the
        // browser and get it subtly wrong once a store is added or removed.
        totalScreens: stores.reduce((sum, store) => sum + store.screenCount, 0),
      });
    } catch (error) {
      console.error('[admin] store list failed', error);
      return errorResponse({ error: 'Could not load stores. Try again shortly.' }, 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await readJsonBody(request);
    if (!body.ok) {
      return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    const parsed = adminStoreSchema.safeParse(body.value);
    if (!parsed.success) {
      return errorResponse(
        { error: 'Some details need fixing.', fields: fieldErrorsFrom(parsed.error) },
        422,
      );
    }

    const draft = parsed.data;

    try {
      const store = await createStore(getPool(), {
        name: draft.name,
        location: draft.location,
        screenCount: draft.screenCount,
        website: draft.website,
        ownerUserId: null,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        status: draft.status,
      });

      return NextResponse.json({ store }, { status: 201 });
    } catch (error) {
      console.error('[admin] store creation failed', error);
      return errorResponse({ error: 'Could not save this store. Please try again.' }, 500);
    }
  });
}

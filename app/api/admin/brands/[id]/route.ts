import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool, withTransaction } from '@/lib/db/pool';
import { countCampaignsForBrand, deleteBrand, findBrandById } from '@/lib/db/repositories/brands';

/**
 * DELETE /api/admin/brands/[id] — remove a brand and everything under it.
 *
 * This is the most destructive endpoint in the project, so it is the one that insists on being asked
 * twice. `campaigns.brand_id` is ON DELETE CASCADE, which means a delete here removes the brand's
 * campaigns *and* their campaign_videos rows in the same statement, irreversibly. There is no undo
 * and no soft-delete column on `brands`.
 *
 * The protocol: the first call arrives without a confirmation and gets a 409 describing exactly what
 * it would destroy. The caller shows that, and only then repeats the request with `?confirm=<name>`.
 * A name has to be typed rather than a boolean `confirm=true`, because the point is to make someone
 * read the brand they are about to remove. It also means a stray DELETE from a script or a retried
 * request cannot destroy anything.
 *
 * The campaign count is re-read inside the transaction that performs the delete rather than trusted
 * from the earlier 409. If a campaign was created in between, the count sent with the confirmation
 * will not match and the delete is refused — the operator confirms against a stale picture of the
 * damage otherwise.
 */

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return withAdmin(async () => {
    if (!UUID_PATTERN.test(params.id)) {
      return errorResponse({ error: 'Not a valid brand id.' }, 400);
    }

    const db = getPool();
    const url = new URL(request.url);
    const confirmation = url.searchParams.get('confirm');
    const expectedCampaignCount = url.searchParams.get('campaignCount');

    try {
      const brand = await findBrandById(db, params.id);
      if (!brand) {
        return errorResponse({ error: 'Brand not found.' }, 404);
      }

      const campaignCount = await countCampaignsForBrand(db, brand.id);

      // Stage one: describe the damage and refuse.
      if (confirmation === null) {
        return NextResponse.json(
          {
            error: 'Deleting a brand also deletes its campaigns.',
            requiresConfirmation: true,
            brand: { id: brand.id, name: brand.name, campaignCount },
          },
          { status: 409 },
        );
      }

      if (confirmation !== brand.name) {
        return errorResponse(
          { error: 'The confirmation did not match the brand name. Nothing was deleted.' },
          400,
        );
      }

      // The count the operator agreed to. Absent means they never saw one, so nothing is confirmed.
      if (expectedCampaignCount === null || Number(expectedCampaignCount) !== campaignCount) {
        return NextResponse.json(
          {
            error: 'This brand now has a different number of campaigns. Nothing was deleted.',
            requiresConfirmation: true,
            brand: { id: brand.id, name: brand.name, campaignCount },
          },
          { status: 409 },
        );
      }

      // One transaction for the count check and the delete, so nothing can be created in between.
      const deleted = await withTransaction(async (tx) => {
        const current = await countCampaignsForBrand(tx, brand.id);
        if (current !== campaignCount) return false;
        return deleteBrand(tx, brand.id);
      });

      if (!deleted) {
        return NextResponse.json(
          {
            error: 'This brand changed while it was being deleted. Nothing was deleted.',
            requiresConfirmation: true,
            brand: { id: brand.id, name: brand.name, campaignCount },
          },
          { status: 409 },
        );
      }

      return NextResponse.json({ deleted: true, brandId: brand.id, campaignsDeleted: campaignCount });
    } catch (error) {
      console.error('[admin] brand deletion failed', error);
      return errorResponse({ error: 'Could not delete this brand.' }, 500);
    }
  });
}

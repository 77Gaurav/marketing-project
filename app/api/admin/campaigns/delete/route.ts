import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { deleteCampaignTask } from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/campaigns/delete
 *
 * Removes a campaign task from a store or deletes the campaign entirely.
 * Emits a DELETE event so players delete the cached video file locally.
 *
 * Request Body:
 *   {
 *     "campaignId": "<uuid>",
 *     "storeId": "<uuid>" (optional)
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

    const campaignId = body.campaignId || body.campaign_id;
    const storeId = body.storeId || body.store_id;

    if (!campaignId) {
      return errorResponse({ error: "Missing required parameter: 'campaignId'." }, 400);
    }

    try {
      const db = getPool();
      const result = await deleteCampaignTask(db, {
        campaignId,
        storeId,
      });

      return NextResponse.json(
        {
          success: true,
          message: `Campaign task removed across ${result.affectedStores.length} store(s). Players will delete the local video file.`,
          ...result,
        },
        { status: 200 },
      );
    } catch (error: any) {
      console.error('[api/admin/campaigns/delete] Error:', error);
      return errorResponse(
        { error: error?.message || 'Failed to delete campaign task.' },
        500,
      );
    }
  });
}

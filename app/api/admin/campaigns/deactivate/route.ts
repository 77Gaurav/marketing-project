import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { deactivateCampaignTask } from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/campaigns/deactivate
 *
 * Deactivates a campaign task for a store or globally across all stores.
 * Emits a DEACTIVATE event so players pause advertising while keeping the video locally.
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
      const result = await deactivateCampaignTask(db, {
        campaignId,
        storeId,
      });

      return NextResponse.json(
        {
          success: true,
          message: `Campaign task deactivated across ${result.affectedStores.length} store(s). Players will retain video locally and pause playback.`,
          ...result,
        },
        { status: 200 },
      );
    } catch (error: any) {
      console.error('[api/admin/campaigns/deactivate] Error:', error);
      return errorResponse(
        { error: error?.message || 'Failed to deactivate campaign.' },
        500,
      );
    }
  });
}

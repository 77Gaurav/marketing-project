import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { assignCampaignToStore } from '@/device_backend';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/campaigns/assign
 *
 * Assigns a campaign to a store, creating a new task in store_task_events with:
 *   - Campaign S3 credentials (bucket, key, presigned access)
 *   - Brand metadata (brandName, campaignName, duration, dimensions)
 *   - Plays per hour
 *
 * Request Body:
 *   {
 *     "campaignId": "<uuid>",
 *     "storeId": "<uuid>",
 *     "playsPerHour": 10
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
    const playsPerHour = body.playsPerHour ? parseInt(body.playsPerHour, 10) : 10;

    if (!campaignId) {
      return errorResponse({ error: "Missing required parameter: 'campaignId'." }, 400);
    }

    if (!storeId) {
      return errorResponse({ error: "Missing required parameter: 'storeId'." }, 400);
    }

    try {
      const db = getPool();
      const event = await assignCampaignToStore(db, {
        campaignId,
        storeId,
        playsPerHour,
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Campaign task successfully assigned to store with S3 credentials and brand metadata.',
          event,
        },
        { status: 201 },
      );
    } catch (error: any) {
      console.error('[api/admin/campaigns/assign] Error:', error);
      return errorResponse(
        { error: error?.message || 'Failed to assign campaign to store.' },
        error?.message?.includes('not found') ? 404 : 500,
      );
    }
  });
}

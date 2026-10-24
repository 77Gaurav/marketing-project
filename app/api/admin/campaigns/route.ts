import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { listAdminCampaigns, deleteCampaignTask, assignCampaignToStore, publishTaskEvent } from '@/device_backend';
import { uniqueSlug } from '@/lib/db/slug';
import { findBrandById } from '@/lib/db/repositories/brands';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/campaigns
 * List all campaigns with attached brand metadata, video creative S3 details, and assigned store tasks.
 */
export async function GET() {
  return withAdmin(async () => {
    try {
      const db = getPool();
      const campaigns = await listAdminCampaigns(db);
      return NextResponse.json({ campaigns }, { status: 200 });
    } catch (error: any) {
      console.error('[api/admin/campaigns] GET error:', error);
      return errorResponse(
        { error: 'Failed to load campaigns: ' + (error?.message || '') },
        500,
      );
    }
  });
}

/**
 * POST /api/admin/campaigns
 * Create a new campaign from the admin console.
 *
 * Body:
 * {
 *   brandId: string;
 *   name: string;
 *   description?: string;
 *   status?: 'DRAFT' | 'IN_REVIEW' | 'SCHEDULED' | 'LIVE' | 'PAUSED';
 *   startsOn?: string;
 *   endsOn?: string;
 *   storeIds?: string[];
 *   playsPerHour?: number;
 * }
 */
export async function POST(request: Request) {
  return withAdmin(async (admin) => {
    const bodyRes = await readJsonBody(request);
    if (!bodyRes.ok) {
      return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    const data = bodyRes.value as Record<string, any>;
    const brandId = data.brandId || data.brand_id;
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : null;
    const status = data.status || 'LIVE';
    const startsOn = data.startsOn || data.starts_on || null;
    const endsOn = data.endsOn || data.ends_on || null;
    const storeIds: string[] = Array.isArray(data.storeIds) ? data.storeIds : [];
    const playsPerHour = Number(data.playsPerHour) || 10;

    if (!brandId) {
      return errorResponse({ error: 'Brand is required.' }, 400);
    }
    if (!name) {
      return errorResponse({ error: 'Campaign name is required.' }, 400);
    }

    const db = getPool();

    try {
      // Verify brand exists
      const brand = await findBrandById(db, brandId);
      if (!brand) {
        return errorResponse({ error: 'Selected brand does not exist.' }, 404);
      }

      // Generate unique slug
      const slug = await uniqueSlug(name, async (candidate) => {
        const check = await db.query(
          `SELECT 1 FROM campaigns WHERE brand_id = $1 AND slug = $2 LIMIT 1`,
          [brandId, candidate],
        );
        return (check.rowCount ?? 0) > 0;
      });

      // Insert campaign
      const insertRes = await db.query<{
        id: string;
        brand_id: string;
        slug: string;
        name: string;
        description: string | null;
        status: string;
        starts_on: Date | null;
        ends_on: Date | null;
        created_at: Date;
      }>(
        `INSERT INTO campaigns (brand_id, slug, name, description, status, starts_on, ends_on, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, brand_id, slug, name, description, status, starts_on, ends_on, created_at`,
        [
          brandId,
          slug,
          name,
          description,
          status,
          startsOn ? new Date(startsOn) : null,
          endsOn ? new Date(endsOn) : null,
          admin.id,
        ],
      );

      const campaign = insertRes.rows[0];

      // Optionally assign to stores
      const assignedStores: string[] = [];
      for (const storeId of storeIds) {
        try {
          await assignCampaignToStore(db, {
            storeId,
            campaignId: campaign.id,
            playsPerHour,
          });
          assignedStores.push(storeId);
        } catch (assignErr) {
          console.warn(`[api/admin/campaigns] Failed to assign store ${storeId}:`, assignErr);
        }
      }

      return NextResponse.json(
        {
          success: true,
          message: `Campaign '${campaign.name}' created successfully.`,
          campaign: {
            id: campaign.id,
            brandId: campaign.brand_id,
            brandName: brand.name,
            slug: campaign.slug,
            name: campaign.name,
            description: campaign.description,
            status: campaign.status,
            startsOn: campaign.starts_on?.toISOString() ?? null,
            endsOn: campaign.ends_on?.toISOString() ?? null,
            createdAt: campaign.created_at.toISOString(),
            assignedStoresCount: assignedStores.length,
          },
        },
        { status: 201 },
      );
    } catch (error: any) {
      console.error('[api/admin/campaigns] POST error:', error);
      return errorResponse(
        { error: 'Failed to create campaign: ' + (error?.message || '') },
        500,
      );
    }
  });
}

/**
 * PATCH /api/admin/campaigns
 * Update campaign status (e.g. reactivate / pause).
 *
 * Body:
 * {
 *   campaignId: string;
 *   status: 'LIVE' | 'PAUSED' | 'DRAFT' | 'COMPLETED' | 'CANCELLED';
 * }
 */
export async function PATCH(request: Request) {
  return withAdmin(async () => {
    const bodyRes = await readJsonBody(request);
    if (!bodyRes.ok) {
      return errorResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    const data = bodyRes.value as Record<string, any>;
    const campaignId = data.campaignId || data.campaign_id || data.id;
    const status = data.status;

    if (!campaignId) {
      return errorResponse({ error: "Missing required parameter: 'campaignId'." }, 400);
    }

    const validStatuses = ['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return errorResponse(
        { error: `Invalid campaign status. Must be one of: ${validStatuses.join(', ')}` },
        400,
      );
    }

    const db = getPool();
    try {
      const updateRes = await db.query(
        `UPDATE campaigns SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [status, campaignId],
      );

      if (updateRes.rowCount === 0) {
        return errorResponse({ error: 'Campaign not found.' }, 404);
      }

      // If updating status, sync assigned store tasks
      if (status === 'LIVE') {
        await db.query(
          `UPDATE campaign_stores SET status = 'ACTIVE', updated_at = now() WHERE campaign_id = $1`,
          [campaignId],
        );

        // Notify stores
        const assigned = await db.query<{ store_id: string }>(
          `SELECT store_id FROM campaign_stores WHERE campaign_id = $1`,
          [campaignId],
        );
        for (const r of assigned.rows) {
          await publishTaskEvent(db, {
            storeId: r.store_id,
            taskId: campaignId,
            action: 'UPSERT',
            status: 'ACTIVE',
          });
        }
      } else if (status === 'PAUSED') {
        await db.query(
          `UPDATE campaign_stores SET status = 'DEACTIVATED', updated_at = now() WHERE campaign_id = $1`,
          [campaignId],
        );

        const assigned = await db.query<{ store_id: string }>(
          `SELECT store_id FROM campaign_stores WHERE campaign_id = $1`,
          [campaignId],
        );
        for (const r of assigned.rows) {
          await publishTaskEvent(db, {
            storeId: r.store_id,
            taskId: campaignId,
            action: 'DEACTIVATE',
            status: 'DEACTIVATED',
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Campaign status updated to ${status}.`,
        campaign: updateRes.rows[0],
      });
    } catch (error: any) {
      console.error('[api/admin/campaigns] PATCH error:', error);
      return errorResponse(
        { error: 'Failed to update campaign status: ' + (error?.message || '') },
        500,
      );
    }
  });
}

/**
 * DELETE /api/admin/campaigns?id=<campaignId>
 * Delete a campaign and publish DELETE task events to all assigned stores.
 */
export async function DELETE(request: Request) {
  return withAdmin(async () => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get('id');
    if (!campaignId) {
      return errorResponse({ error: "Missing required query parameter: 'id'." }, 400);
    }

    try {
      const db = getPool();
      const result = await deleteCampaignTask(db, { campaignId });
      return NextResponse.json(
        {
          success: true,
          message: `Campaign and tasks deleted across ${result.affectedStores.length} store(s).`,
          ...result,
        },
        { status: 200 },
      );
    } catch (error: any) {
      console.error('[api/admin/campaigns] DELETE error:', error);
      return errorResponse(
        { error: 'Failed to delete campaign: ' + (error?.message || '') },
        500,
      );
    }
  });
}

import { NextResponse } from 'next/server';
import { errorResponse, withAdmin } from '@/lib/api/admin';
import { getPool } from '@/lib/db/pool';
import { findBrandById, updateBrandStatus } from '@/lib/db/repositories/brands';
import type { BrandStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/brands/deactivate
 *
 * Deactivates or changes the status of a brand.
 *
 * Request Body:
 *   {
 *     "brandId": "<uuid>",
 *     "status": "SUSPENDED" | "PENDING_REVIEW" | "ACTIVE" (optional, default "SUSPENDED")
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

    const brandId = body.brandId || body.brand_id || body.id;
    const targetStatus: BrandStatus = (body.status as BrandStatus) || 'SUSPENDED';

    if (!brandId) {
      return errorResponse({ error: "Missing required parameter: 'brandId'." }, 400);
    }

    const validStatuses: BrandStatus[] = ['ACTIVE', 'PENDING_REVIEW', 'SUSPENDED'];
    if (!validStatuses.includes(targetStatus)) {
      return errorResponse(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        400,
      );
    }

    try {
      const db = getPool();
      const brand = await findBrandById(db, brandId);
      if (!brand) {
        return errorResponse({ error: 'Brand not found.' }, 404);
      }

      const updated = await updateBrandStatus(db, brandId, targetStatus);

      return NextResponse.json(
        {
          success: true,
          message: targetStatus === 'SUSPENDED' 
            ? `Brand '${brand.name}' deactivated successfully.` 
            : `Brand '${brand.name}' status set to ${targetStatus}.`,
          brand: updated,
        },
        { status: 200 },
      );
    } catch (error: any) {
      console.error('[api/admin/brands/deactivate] Error:', error);
      return errorResponse(
        { error: error?.message || 'Failed to update brand status.' },
        500,
      );
    }
  });
}

import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { publishTaskEvent, assignCampaignToStore, findStoreByIdOrSlug } from '@/device_backend';
import {
  traceAdminRequest,
  traceAdminChildSpan,
  logAdminInfo,
  logAdminWarn,
  logAdminError,
} from '@/lib/observability/logfire';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/store/tasks?storeId=<storeId>
 * List task events for a given store.
 */
export async function GET(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: GET /api/admin/store/tasks',
      method: 'GET',
      path: '/api/admin/store/tasks',
      request,
    },
    async () => {
      const url = new URL(request.url);
      const storeId = url.searchParams.get('storeId') || url.searchParams.get('store_id');
      if (!storeId) {
        logAdminWarn('[admin/store/tasks] Missing storeId in query');
        return NextResponse.json(
          { error: "Query parameter 'storeId' is required." },
          { status: 400 },
        );
      }

      const db = getPool();
      try {
        const store = await traceAdminChildSpan(
          'admin.db.findStore',
          { storeId },
          async () => {
            return await findStoreByIdOrSlug(db, storeId);
          },
        );

        if (!store) {
          logAdminWarn('[admin/store/tasks] Store not found', { storeId });
          return NextResponse.json({ error: 'Store not found.' }, { status: 404 });
        }

        const eventsResult = await traceAdminChildSpan(
          'admin.db.listTaskEvents',
          { storeId: store.id },
          async () => {
            return await db.query(
              `SELECT id, revision::text AS revision, store_id, task_id, version, action, status, creative_id, s3_bucket, s3_key, plays_per_hour, metadata, created_at
               FROM store_task_events
               WHERE store_id = $1
               ORDER BY revision DESC
               LIMIT 100`,
              [store.id],
            );
          },
        );

        const maxRevResult = await db.query<{ max_rev: string | null }>(
          `SELECT MAX(revision)::text AS max_rev FROM store_task_events WHERE store_id = $1`,
          [store.id],
        );

        logAdminInfo('[admin/store/tasks] Events retrieved', {
          storeId: store.id,
          count: eventsResult.rows.length,
        });

        return NextResponse.json(
          {
            storeId: store.id,
            currentRevision: maxRevResult.rows[0]?.max_rev
              ? parseInt(maxRevResult.rows[0].max_rev, 10)
              : 0,
            events: eventsResult.rows.map((r) => ({
              ...r,
              revision: parseInt(r.revision, 10),
            })),
          },
          { status: 200 },
        );
      } catch (error: any) {
        logAdminError('[api/admin/store/tasks] GET error', error);
        return NextResponse.json(
          { error: error?.message || 'Failed to list store task events.' },
          { status: 500 },
        );
      }
    },
  );
}

/**
 * POST /api/admin/store/tasks
 * Publish task event for a store.
 */
export async function POST(request: Request) {
  return await traceAdminRequest(
    {
      name: 'admin.api: POST /api/admin/store/tasks',
      method: 'POST',
      path: '/api/admin/store/tasks',
      request,
    },
    async () => {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
      }

      const storeId = body.storeId || body.store_id;
      const taskId = body.taskId || body.task_id || body.campaignId || body.campaign_id;
      const action = (body.action || 'UPSERT').toUpperCase();

      if (!storeId) {
        logAdminWarn('[admin/store/tasks] POST missing storeId');
        return NextResponse.json({ error: "Missing required field: 'storeId'." }, { status: 400 });
      }

      if (!taskId) {
        logAdminWarn('[admin/store/tasks] POST missing taskId');
        return NextResponse.json({ error: "Missing required field: 'taskId'." }, { status: 400 });
      }

      if (!['UPSERT', 'DEACTIVATE', 'DELETE'].includes(action)) {
        return NextResponse.json(
          { error: "Invalid action. Expected 'UPSERT', 'DEACTIVATE', or 'DELETE'." },
          { status: 400 },
        );
      }

      const db = getPool();
      try {
        if (body.campaignId) {
          const result = await traceAdminChildSpan(
            'admin.campaign.assignToStore',
            { storeId, campaignId: body.campaignId },
            async () => {
              return await assignCampaignToStore(db, {
                storeId,
                campaignId: body.campaignId,
                playsPerHour: body.playsPerHour ? parseInt(body.playsPerHour, 10) : 10,
                status: action === 'DEACTIVATE' ? 'DEACTIVATED' : 'ACTIVE',
              });
            },
          );

          logAdminInfo('[admin/store/tasks] Campaign assigned to store', {
            storeId,
            campaignId: body.campaignId,
          });

          return NextResponse.json(
            {
              success: true,
              message: `Campaign task event '${action}' published successfully.`,
              event: result,
            },
            { status: 201 },
          );
        }

        const result = await traceAdminChildSpan(
          'admin.task.publishEvent',
          { storeId, taskId, action },
          async () => {
            return await publishTaskEvent(db, {
              storeId,
              taskId,
              version: body.version ? parseInt(body.version, 10) : undefined,
              action: action as any,
              status: body.status || (action === 'UPSERT' ? 'ACTIVE' : undefined),
              creativeId: body.creativeId || body.creative_id,
              s3Bucket: body.s3Bucket || body.s3_bucket || 'st-media-encoded',
              s3Key: body.s3Key || body.s3_key || `videos/${body.creativeId || taskId}.mp4`,
              playsPerHour: body.playsPerHour ? parseInt(body.playsPerHour, 10) : 10,
              metadata: body.metadata || {},
            });
          },
        );

        logAdminInfo('[admin/store/tasks] Task event published', {
          storeId,
          taskId,
          action,
        });

        return NextResponse.json(
          {
            success: true,
            message: `Task event '${action}' published successfully.`,
            event: result,
          },
          { status: 201 },
        );
      } catch (error: any) {
        logAdminError('[api/admin/store/tasks] POST error', error);
        return NextResponse.json(
          { error: error?.message || 'Failed to publish task event.' },
          { status: 500 },
        );
      }
    },
  );
}

import { getPool, type Executor } from '@/lib/db/pool';
import { getPresignedGetUrl } from '@/lib/aws/s3';
import { findDeviceByHardwareId, findStoreByIdOrSlug, updateDeviceLastSeen } from './repository';
import type {
  TaskAction,
  TaskChange,
  TaskChangeUpsert,
  TaskChangeDeactivate,
  TaskChangeDelete,
  DeviceTasksResponse,
  StoreTaskEventRow,
} from './types';

export interface PublishTaskEventInput {
  storeId: string;
  taskId: string;
  version?: number;
  action: TaskAction;
  status?: string;
  creativeId?: string;
  s3Bucket?: string;
  s3Key?: string;
  playsPerHour?: number;
  metadata?: Record<string, unknown>;
}

export interface PublishTaskEventResult {
  id: string;
  revision: number;
  storeId: string;
  taskId: string;
  version: number;
  action: TaskAction;
  status: string | null;
  creativeId: string | null;
  playsPerHour: number;
}

/**
 * Publish a task change event (UPSERT, DEACTIVATE, DELETE) to the store task event journal.
 * Auto-increments version for the (storeId, taskId) pair if not explicitly provided.
 */
export async function publishTaskEvent(
  db: Executor,
  input: PublishTaskEventInput,
): Promise<PublishTaskEventResult> {
  const store = await findStoreByIdOrSlug(db, input.storeId);
  if (!store) {
    throw new Error(`Store '${input.storeId}' not found.`);
  }
  const resolvedStoreId = store.id;

  let version = input.version;
  if (typeof version !== 'number' || version <= 0) {
    // Auto-resolve previous version and increment by 1
    const prevResult = await db.query<{ max_version: number | null }>(
      `SELECT MAX(version) AS max_version
       FROM store_task_events
       WHERE store_id = $1 AND task_id = $2`,
      [resolvedStoreId, input.taskId],
    );
    const prevVersion = prevResult.rows[0]?.max_version ?? 0;
    version = prevVersion + 1;
  }

  // Calculate the next revision strictly per-store starting from 0:
  // If store has 0 events, first event gets revision = 1 (advancing store from baseline 0).
  const revResult = await db.query<{ next_rev: string }>(
    `SELECT (COALESCE(MAX(revision), 0) + 1)::text AS next_rev
     FROM store_task_events
     WHERE store_id = $1`,
    [resolvedStoreId],
  );
  const nextRevision = parseInt(revResult.rows[0].next_rev, 10);

  const result = await db.query<StoreTaskEventRow>(
    `INSERT INTO store_task_events (
       store_id, task_id, revision, version, action, status, creative_id, s3_bucket, s3_key, plays_per_hour, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, revision, store_id, task_id, version, action, status, creative_id, s3_bucket, s3_key, plays_per_hour, metadata, created_at`,
    [
      resolvedStoreId,
      input.taskId,
      nextRevision,
      version,
      input.action,
      input.status ?? (input.action === 'UPSERT' ? 'ACTIVE' : null),
      input.creativeId ?? null,
      input.s3Bucket ?? null,
      input.s3Key ?? null,
      input.playsPerHour ?? 10,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const row = result.rows[0];
  const revision = typeof row.revision === 'string' ? parseInt(row.revision, 10) : Number(row.revision);

  return {
    id: row.id,
    revision,
    storeId: row.store_id,
    taskId: row.task_id,
    version: row.version,
    action: row.action,
    status: row.status,
    creativeId: row.creative_id,
    playsPerHour: row.plays_per_hour ?? 10,
  };
}

export type GetDeviceTasksServiceResult =
  | {
      ok: true;
      data: DeviceTasksResponse;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

/**
 * Service handling hardware player task polling.
 *
 * GET /api/devices/:deviceID/tasks?sinceRevision=42
 *
 * 1. Resolves device by hardware deviceId.
 * 2. Verifies device is active, registered, and assigned to an active store.
 * 3. If sinceRevision > 0: fetches incremental changes recorded after sinceRevision.
 * 4. If sinceRevision == 0 (fresh sync): fetches current snapshot of active tasks.
 * 5. Generates presigned S3 GetObject URLs for UPSERT actions with graceful local fallback.
 * 6. Returns { revision, changes }.
 */
export async function getDeviceTasksService(
  options: {
    deviceId: string;
    sinceRevision?: number;
    urlExpiresInSeconds?: number;
    db?: Executor;
  },
): Promise<GetDeviceTasksServiceResult> {
  const db = options.db ?? getPool();
  const trimmedDeviceId = String(options.deviceId || '').trim();
  const sinceRevision = Math.max(0, options.sinceRevision ?? 0);
  const urlExpiresInSeconds = options.urlExpiresInSeconds ?? 86400; // 24 hours default

  if (!trimmedDeviceId) {
    return {
      ok: false,
      error: 'Invalid or missing deviceId.',
      status: 400,
    };
  }

  // 1. Resolve device by hardware ID
  const device = await findDeviceByHardwareId(db, trimmedDeviceId);
  if (!device) {
    return {
      ok: false,
      error: `Device #${trimmedDeviceId} not found in database.`,
      status: 404,
    };
  }

  // 2. Verify device status
  if (device.status === 'REVOKED') {
    return {
      ok: false,
      error: 'Device access has been revoked.',
      status: 401,
    };
  }

  if (device.status !== 'Activated' && device.status !== 'ACTIVATED') {
    return {
      ok: false,
      error: 'Device is not activated. Please activate the hardware player first.',
      status: 401,
    };
  }

  if (!device.storeId) {
    return {
      ok: false,
      error: 'Device is not associated with any store.',
      status: 400,
    };
  }

  // 3. Verify associated store is active
  const store = await findStoreByIdOrSlug(db, device.storeId);
  if (!store || store.status !== 'ACTIVE') {
    return {
      ok: false,
      error: 'Associated store is not active. Devices can only poll tasks for active stores.',
      status: 401,
    };
  }

  // 4. Update device heartbeat last_seen_at asynchronously
  updateDeviceLastSeen(db, device.deviceId).catch(() => {});

  // 5. Query task events
  const changes: TaskChange[] = [];
  let currentRevision = sinceRevision;

  // Query highest revision for this store
  const maxRevResult = await db.query<{ max_rev: string | null }>(
    `SELECT MAX(revision)::text AS max_rev FROM store_task_events WHERE store_id = $1`,
    [store.id],
  );
  const latestStoreRevision = maxRevResult.rows[0]?.max_rev
    ? parseInt(maxRevResult.rows[0].max_rev, 10)
    : 0;

  // 5. Query task events recorded after sinceRevision (delta change stream)
  const eventsResult = await db.query<StoreTaskEventRow>(
    `SELECT id, revision::text AS revision, store_id, task_id, version, action, status, creative_id, s3_bucket, s3_key, plays_per_hour, metadata, created_at
     FROM store_task_events
     WHERE store_id = $1 AND revision > $2
     ORDER BY revision ASC`,
    [store.id, sinceRevision],
  );

  for (const row of eventsResult.rows) {
    const rowRevision = parseInt(String(row.revision), 10);
    if (rowRevision > currentRevision) {
      currentRevision = rowRevision;
    }

    if (row.action === 'UPSERT') {
      const bucket = row.s3_bucket || 'st-media-encoded';
      const key = row.s3_key || `videos/${row.creative_id || row.task_id}.mp4`;
      const presigned = await getPresignedGetUrl({
        bucket,
        key,
        expiresIn: urlExpiresInSeconds,
      });

      const change: TaskChangeUpsert = {
        taskId: row.task_id,
        version: row.version,
        action: 'UPSERT',
        status: row.status || 'ACTIVE',
        creativeId: row.creative_id || `creative_${row.task_id}`,
        downloadUrl: presigned.url,
        expiresAt: presigned.expiresAt,
        playsPerHour: row.plays_per_hour ?? 10,
      };
      changes.push(change);
    } else if (row.action === 'DEACTIVATE') {
      const change: TaskChangeDeactivate = {
        taskId: row.task_id,
        version: row.version,
        action: 'DEACTIVATE',
      };
      changes.push(change);
    } else if (row.action === 'DELETE') {
      const change: TaskChangeDelete = {
        taskId: row.task_id,
        version: row.version,
        action: 'DELETE',
      };
      changes.push(change);
    }
  }

  // Ensure currentRevision reflects the highest known revision for this store
  currentRevision = Math.max(currentRevision, latestStoreRevision);

  return {
    ok: true,
    data: {
      revision: currentRevision,
      changes,
    },
  };
}

/**
 * Assign or update a campaign task for a store and publish an event to store_task_events.
 * Attaches campaign S3 credentials and brand metadata to the task event.
 */
export async function assignCampaignToStore(
  db: Executor,
  input: {
    storeId: string;
    campaignId: string;
    playsPerHour?: number;
    status?: 'ACTIVE' | 'PAUSED' | 'DEACTIVATED';
  },
): Promise<PublishTaskEventResult> {
  const store = await findStoreByIdOrSlug(db, input.storeId);
  if (!store) {
    throw new Error(`Store '${input.storeId}' not found.`);
  }

  // Look up campaign, attached brand, and attached video creative
  const campaignRes = await db.query<{
    id: string;
    name: string;
    status: string;
    brand_id: string;
    brand_name: string | null;
    brand_slug: string | null;
    video_id: string | null;
    source_filename: string | null;
    duration_seconds: number | null;
    width: number | null;
    height: number | null;
    original_bucket: string | null;
    original_key: string | null;
    encoded_bucket: string | null;
    encoded_key: string | null;
  }>(
    `SELECT c.id, c.name, c.status, c.brand_id,
            b.name AS brand_name, b.slug AS brand_slug,
            v.id AS video_id, v.source_filename, v.duration_seconds, v.width, v.height,
            v.original_bucket, v.original_key, v.encoded_bucket, v.encoded_key
     FROM campaigns c
     LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN campaign_videos v ON v.campaign_id = c.id
     WHERE c.id = $1`,
    [input.campaignId],
  );

  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw new Error(`Campaign '${input.campaignId}' not found.`);
  }

  const status = input.status || (campaign.status === 'LIVE' ? 'ACTIVE' : 'ACTIVE');
  const action: TaskAction = status === 'DEACTIVATED' || status === 'PAUSED' ? 'DEACTIVATE' : 'UPSERT';
  const bucket = campaign.encoded_bucket || campaign.original_bucket || 'st-media-encoded';
  const key = campaign.encoded_key || campaign.original_key || `videos/${campaign.video_id || campaign.id}.mp4`;

  // Upsert into campaign_stores junction
  await db.query(
    `INSERT INTO campaign_stores (campaign_id, store_id, plays_per_hour, status, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (campaign_id, store_id)
     DO UPDATE SET plays_per_hour = EXCLUDED.plays_per_hour,
                   status = EXCLUDED.status,
                   updated_at = now()`,
    [campaign.id, store.id, input.playsPerHour ?? 10, status],
  );

  return publishTaskEvent(db, {
    storeId: store.id,
    taskId: campaign.id,
    action,
    status,
    creativeId: campaign.video_id || `creative_${campaign.id}`,
    s3Bucket: bucket,
    s3Key: key,
    playsPerHour: input.playsPerHour ?? 10,
    metadata: {
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      brandId: campaign.brand_id,
      brandName: campaign.brand_name || 'Brand',
      brandSlug: campaign.brand_slug,
      videoDuration: campaign.duration_seconds,
      videoFilename: campaign.source_filename,
      dimensions: campaign.width && campaign.height ? `${campaign.width}x${campaign.height}` : undefined,
    },
  });
}

/**
 * Deactivate a campaign task for a store or across all assigned stores.
 * Publishes DEACTIVATE event so players stop playback while keeping the video locally.
 */
export async function deactivateCampaignTask(
  db: Executor,
  input: {
    campaignId: string;
    storeId?: string;
  },
): Promise<{ affectedStores: string[]; results: PublishTaskEventResult[] }> {
  let targetStoreIds: string[] = [];

  if (input.storeId) {
    const store = await findStoreByIdOrSlug(db, input.storeId);
    if (!store) throw new Error(`Store '${input.storeId}' not found.`);
    targetStoreIds = [store.id];
  } else {
    // Find all stores where this campaign is assigned
    const assigned = await db.query<{ store_id: string }>(
      `SELECT store_id FROM campaign_stores WHERE campaign_id = $1`,
      [input.campaignId],
    );
    targetStoreIds = assigned.rows.map((r) => r.store_id);
  }

  // Update campaign_stores status
  if (input.storeId) {
    await db.query(
      `UPDATE campaign_stores SET status = 'DEACTIVATED', updated_at = now() WHERE campaign_id = $1 AND store_id = $2`,
      [input.campaignId, targetStoreIds[0]],
    );
  } else {
    await db.query(
      `UPDATE campaign_stores SET status = 'DEACTIVATED', updated_at = now() WHERE campaign_id = $1`,
      [input.campaignId],
    );
    // Also update campaign table
    await db.query(`UPDATE campaigns SET status = 'PAUSED', updated_at = now() WHERE id = $1`, [input.campaignId]);
  }

  const results: PublishTaskEventResult[] = [];
  for (const storeId of targetStoreIds) {
    const res = await publishTaskEvent(db, {
      storeId,
      taskId: input.campaignId,
      action: 'DEACTIVATE',
      status: 'DEACTIVATED',
    });
    results.push(res);
  }

  return { affectedStores: targetStoreIds, results };
}

/**
 * Delete a campaign task for a store or delete campaign globally.
 * Publishes DELETE event so players delete the cached video file locally.
 */
export async function deleteCampaignTask(
  db: Executor,
  input: {
    campaignId: string;
    storeId?: string;
  },
): Promise<{ affectedStores: string[]; deletedCampaign: boolean }> {
  let targetStoreIds: string[] = [];

  if (input.storeId) {
    const store = await findStoreByIdOrSlug(db, input.storeId);
    if (!store) throw new Error(`Store '${input.storeId}' not found.`);
    targetStoreIds = [store.id];
    await db.query(`DELETE FROM campaign_stores WHERE campaign_id = $1 AND store_id = $2`, [input.campaignId, store.id]);
  } else {
    // Find all stores
    const assigned = await db.query<{ store_id: string }>(
      `SELECT store_id FROM campaign_stores WHERE campaign_id = $1`,
      [input.campaignId],
    );
    targetStoreIds = assigned.rows.map((r) => r.store_id);

    // Delete S3 video creatives (original & encoded) for this campaign
    try {
      const { deleteCampaignS3Creatives } = await import('@/lib/aws/s3');
      await deleteCampaignS3Creatives(db, input.campaignId);
    } catch (err) {
      console.warn(`[tasks] Failed deleting S3 creatives for campaign ${input.campaignId}:`, err);
    }

    await db.query(`DELETE FROM campaign_stores WHERE campaign_id = $1`, [input.campaignId]);
    await db.query(`DELETE FROM campaigns WHERE id = $1`, [input.campaignId]);
  }

  // Publish DELETE event to affected stores
  for (const storeId of targetStoreIds) {
    await publishTaskEvent(db, {
      storeId,
      taskId: input.campaignId,
      action: 'DELETE',
    });
  }

  return { affectedStores: targetStoreIds, deletedCampaign: !input.storeId };
}

export interface AdminCampaignListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  brand: {
    id: string;
    name: string;
    slug: string;
  };
  video: {
    id: string;
    status: string;
    sourceFilename: string;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    s3Bucket: string | null;
    s3Key: string | null;
  } | null;
  assignedStores: {
    storeId: string;
    storeName: string;
    storeSlug: string;
    playsPerHour: number;
    status: string;
    assignedAt: string;
  }[];
}

/**
 * List all campaigns with attached brand metadata, creative video details, and assigned stores.
 */
export async function listAdminCampaigns(db: Executor): Promise<AdminCampaignListItem[]> {
  const campaignsRes = await db.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    starts_on: string | null;
    ends_on: string | null;
    created_at: Date;
    brand_id: string;
    brand_name: string;
    brand_slug: string;
    video_id: string | null;
    video_status: string | null;
    source_filename: string | null;
    duration_seconds: number | null;
    width: number | null;
    height: number | null;
    original_bucket: string | null;
    original_key: string | null;
    encoded_bucket: string | null;
    encoded_key: string | null;
  }>(
    `SELECT c.id, c.name, c.slug, c.status, c.starts_on, c.ends_on, c.created_at,
            b.id AS brand_id, b.name AS brand_name, b.slug AS brand_slug,
            v.id AS video_id, v.status AS video_status, v.source_filename, v.duration_seconds,
            v.width, v.height, v.original_bucket, v.original_key, v.encoded_bucket, v.encoded_key
     FROM campaigns c
     LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN campaign_videos v ON v.campaign_id = c.id
     ORDER BY c.created_at DESC`,
  );

  const assignmentsRes = await db.query<{
    campaign_id: string;
    store_id: string;
    store_name: string;
    store_slug: string;
    plays_per_hour: number;
    status: string;
    created_at: Date;
  }>(
    `SELECT cs.campaign_id, cs.store_id, cs.plays_per_hour, cs.status, cs.created_at,
            s.name AS store_name, s.slug AS store_slug
     FROM campaign_stores cs
     JOIN stores s ON s.id = cs.store_id
     ORDER BY cs.created_at ASC`,
  );

  const storeMap = new Map<string, AdminCampaignListItem['assignedStores']>();
  for (const row of assignmentsRes.rows) {
    const list = storeMap.get(row.campaign_id) || [];
    list.push({
      storeId: row.store_id,
      storeName: row.store_name,
      storeSlug: row.store_slug,
      playsPerHour: row.plays_per_hour,
      status: row.status,
      assignedAt: row.created_at.toISOString(),
    });
    storeMap.set(row.campaign_id, list);
  }

  return campaignsRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    createdAt: row.created_at.toISOString(),
    brand: {
      id: row.brand_id,
      name: row.brand_name || 'Brand',
      slug: row.brand_slug || '',
    },
    video: row.video_id
      ? {
          id: row.video_id,
          status: row.video_status || 'READY',
          sourceFilename: row.source_filename || 'creative.mp4',
          durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
          width: row.width,
          height: row.height,
          s3Bucket: row.encoded_bucket || row.original_bucket || 'st-media-encoded',
          s3Key: row.encoded_key || row.original_key || `videos/${row.video_id}.mp4`,
        }
      : null,
    assignedStores: storeMap.get(row.id) || [],
  }));
}


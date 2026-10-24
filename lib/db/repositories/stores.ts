import type { QueryResultRow } from 'pg';
import type { Executor } from '@/lib/db/pool';
import { uniqueSlug } from '@/lib/db/slug';
import type { Store, StoreCreative, StoreListEntry, StoreStatus } from '@/lib/db/types';

/**
 * Reads and writes on `stores`.
 *
 * A store is a venue that supplies screens. Nothing in the campaign flow touches this table — an
 * operator adds venues through the admin console — but it has existed since db/migrations/0001 so
 * that role-based access and the discovery flow had a target.
 *
 * `location` and `screen_count` are the two facts an operator needs at a glance, and they arrived in
 * db/migrations/0003. Store creative storage columns arrived in db/migrations/0011.
 */

interface StoreRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  location: string;
  screen_count: number;
  website: string | null;
  owner_user_id: string | null;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  status: StoreStatus;
  created_at: Date;
  creative_url?: string | null;
  creative_key?: string | null;
  creative_bucket?: string | null;
  creative_type?: string | null;
  video_url?: string | null;
  video_key?: string | null;
  video_bucket?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coordinates?: { lat: number; lng: number } | null;
}

const COLUMNS =
  'id, name, slug, location, screen_count, website, owner_user_id, contact_name, contact_email, contact_phone, status, created_at, creative_url, creative_key, creative_bucket, creative_type, video_url, video_key, video_bucket, latitude, longitude, coordinates';

/** The same list, table-qualified, for queries that join. */
const COLUMNS_JOINED =
  's.id, s.name, s.slug, s.location, s.screen_count, s.website, s.owner_user_id, s.contact_name, s.contact_email, s.contact_phone, s.status, s.created_at, s.creative_url, s.creative_key, s.creative_bucket, s.creative_type, s.video_url, s.video_key, s.video_bucket, s.latitude, s.longitude, s.coordinates';

function toStore(row: StoreRow): Store {
  const lat = row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null;
  const lng = row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    location: row.location,
    screenCount: row.screen_count,
    website: row.website,
    ownerUserId: row.owner_user_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    creativeUrl: row.creative_url ?? null,
    creativeKey: row.creative_key ?? null,
    creativeBucket: row.creative_bucket ?? null,
    creativeType: row.creative_type ?? null,
    videoUrl: row.video_url ?? null,
    videoKey: row.video_key ?? null,
    videoBucket: row.video_bucket ?? null,
    latitude: lat,
    longitude: lng,
    coordinates:
      row.coordinates && typeof row.coordinates === 'object'
        ? (row.coordinates as { lat: number; lng: number })
        : lat !== null && lng !== null
          ? { lat, lng }
          : null,
  };
}

async function slugIsTaken(db: Executor, slug: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM stores WHERE slug = $1 LIMIT 1`, [slug]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Every venue, largest inventory first.
 *
 * Ordered by screen count rather than alphabetically because the console's first question is "how big
 * is this network" and the answer is the top of this list. Ties break on name so the order is stable
 * across page loads — an operator scrolling back up should not find rows they already read reordered.
 * The owner email is joined in so a venue with an account behind it can be traced back to one without
 * a second request per row.
 */
export async function listStores(db: Executor): Promise<StoreListEntry[]> {
  const result = await db.query<StoreRow & { owner_email: string | null }>(
    `SELECT ${COLUMNS_JOINED}, u.email AS owner_email
     FROM stores s
     LEFT JOIN users u ON u.id = s.owner_user_id
     ORDER BY s.screen_count DESC, s.name ASC`,
  );

  return result.rows.map((row) => ({ ...toStore(row), ownerEmail: row.owner_email }));
}

export interface CreateStoreInput {
  name: string;
  location: string;
  screenCount: number;
  website: string | null;
  /** Null for a venue an operator recorded by hand — there is no account behind it. */
  ownerUserId: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  status: StoreStatus;
  latitude?: number | null;
  longitude?: number | null;
}

export async function createStore(db: Executor, input: CreateStoreInput): Promise<Store> {
  const slug = await uniqueSlug(input.name, (candidate) => slugIsTaken(db, candidate));
  const lat = input.latitude !== undefined && input.latitude !== null ? Number(input.latitude) : null;
  const lng = input.longitude !== undefined && input.longitude !== null ? Number(input.longitude) : null;
  const coords = lat !== null && lng !== null ? JSON.stringify({ lat, lng }) : null;

  const result = await db.query<StoreRow>(
    `INSERT INTO stores (
       name, slug, location, screen_count, website, owner_user_id,
       contact_name, contact_email, contact_phone, status,
       latitude, longitude, coordinates
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     RETURNING ${COLUMNS}`,
    [
      input.name,
      slug,
      input.location,
      input.screenCount,
      input.website,
      input.ownerUserId,
      input.contactName,
      input.contactEmail.toLowerCase(),
      input.contactPhone,
      input.status,
      lat,
      lng,
      coords,
    ],
  );

  return toStore(result.rows[0]);
}

export async function updateStoreLocationAndCoordinates(
  db: Executor,
  id: string,
  input: {
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<Store | null> {
  const lat = input.latitude !== undefined && input.latitude !== null ? Number(input.latitude) : null;
  const lng = input.longitude !== undefined && input.longitude !== null ? Number(input.longitude) : null;
  const coords = lat !== null && lng !== null ? JSON.stringify({ lat, lng }) : null;

  const result = await db.query<StoreRow>(
    `UPDATE stores
     SET location = COALESCE($1, location),
         latitude = $2,
         longitude = $3,
         coordinates = $4::jsonb
     WHERE id = $5
     RETURNING ${COLUMNS}`,
    [input.location ?? null, lat, lng, coords, id],
  );

  return result.rows[0] ? toStore(result.rows[0]) : null;
}

export async function findStoreById(db: Executor, id: string): Promise<Store | null> {
  const result = await db.query<StoreRow>(`SELECT ${COLUMNS} FROM stores WHERE id = $1`, [id]);
  return result.rows[0] ? toStore(result.rows[0]) : null;
}

/**
 * Remove a venue. Returns false when the id matched nothing, so the route can answer 404 instead of
 * reporting a success that deleted nothing.
 *
 * A plain DELETE rather than a soft delete because nothing references a store yet — no campaign is
 * allocated to a venue, because allocation is a later phase. When `campaign_allocations` exists this
 * becomes a decision rather than a convenience: either refuse to delete a venue with history, or keep
 * the row and set a status of CLOSED, which `store_status` already allows for.
 */
export async function deleteStore(db: Executor, id: string): Promise<boolean> {
  // If any activation is running, make sure we delete the activation first, then delete store
  await db.query(
    `DELETE FROM devices
     WHERE store_id = $1 AND (status = 'Activation Pending' OR status = 'PENDING')`,
    [id],
  );

  const result = await db.query(`DELETE FROM stores WHERE id = $1`, [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Update a store's status (e.g. ACTIVE vs PAUSED/CLOSED).
 * If deactivating (status !== 'ACTIVE'), any running activation is deleted first.
 */
export async function updateStoreStatus(
  db: Executor,
  id: string,
  status: StoreStatus,
): Promise<Store | null> {
  // If store is deactivated by admin, delete any running activations first
  if (status !== 'ACTIVE') {
    await db.query(
      `DELETE FROM devices
       WHERE store_id = $1 AND (status = 'Activation Pending' OR status = 'PENDING')`,
      [id],
    );
  }

  const result = await db.query<StoreRow>(
    `UPDATE stores SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [status, id],
  );
  return result.rows[0] ? toStore(result.rows[0]) : null;
}

export interface UpdateStoreCreativeInput {
  creativeUrl: string;
  creativeKey: string;
  creativeBucket: string;
  creativeType: string;
  name?: string;
  fileSize?: number;
}

/**
 * Updates a store's primary creative and persists the asset into the `store_creatives` collection table.
 */
export async function updateStoreCreative(
  db: Executor,
  storeId: string,
  input: UpdateStoreCreativeInput,
): Promise<{ store: Store; creative: StoreCreative }> {
  const isVideo =
    input.creativeType.startsWith('video/') ||
    input.creativeKey.endsWith('.mp4') ||
    input.creativeKey.endsWith('.mkv');

  // 1. Update stores table with creative fields
  const storeResult = await db.query<StoreRow>(
    `UPDATE stores
     SET creative_url = $2,
         creative_key = $3,
         creative_bucket = $4,
         creative_type = $5,
         video_url = CASE WHEN $6 THEN $2 ELSE video_url END,
         video_key = CASE WHEN $6 THEN $3 ELSE video_key END,
         video_bucket = CASE WHEN $6 THEN $4 ELSE video_bucket END,
         updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [
      storeId,
      input.creativeUrl,
      input.creativeKey,
      input.creativeBucket,
      input.creativeType,
      isVideo,
    ],
  );

  if (!storeResult.rows[0]) {
    throw new Error(`Store '${storeId}' not found.`);
  }

  // 2. Insert into store_creatives collection
  const creativeResult = await db.query<{
    id: string;
    store_id: string;
    name: string;
    mime_type: string;
    file_size: string | number | null;
    s3_bucket: string;
    s3_key: string;
    url: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO store_creatives (
       store_id, name, mime_type, file_size, s3_bucket, s3_key, url, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'UPLOADED')
     RETURNING id, store_id, name, mime_type, file_size, s3_bucket, s3_key, url, status, created_at, updated_at`,
    [
      storeId,
      input.name || input.creativeKey.split('/').pop() || 'store-creative',
      input.creativeType,
      input.fileSize ?? null,
      input.creativeBucket,
      input.creativeKey,
      input.creativeUrl,
    ],
  );

  const cRow = creativeResult.rows[0];
  const creative: StoreCreative = {
    id: cRow.id,
    storeId: cRow.store_id,
    name: cRow.name,
    mimeType: cRow.mime_type,
    fileSize: cRow.file_size ? Number(cRow.file_size) : null,
    s3Bucket: cRow.s3_bucket,
    s3Key: cRow.s3_key,
    url: cRow.url,
    status: cRow.status,
    createdAt: cRow.created_at.toISOString(),
    updatedAt: cRow.updated_at.toISOString(),
  };

  return {
    store: toStore(storeResult.rows[0]),
    creative,
  };
}

/**
 * List all custom creatives ingested for a store.
 */
export async function listStoreCreatives(
  db: Executor,
  storeId: string,
): Promise<StoreCreative[]> {
  const result = await db.query<{
    id: string;
    store_id: string;
    name: string;
    mime_type: string;
    file_size: string | number | null;
    s3_bucket: string;
    s3_key: string;
    url: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, store_id, name, mime_type, file_size, s3_bucket, s3_key, url, status, created_at, updated_at
     FROM store_creatives
     WHERE store_id = $1
     ORDER BY created_at DESC`,
    [storeId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    mimeType: row.mime_type,
    fileSize: row.file_size ? Number(row.file_size) : null,
    s3Bucket: row.s3_bucket,
    s3Key: row.s3_key,
    url: row.url,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Delete a store's creative or all creatives for the store, cleaning up S3 assets.
 */
export async function deleteStoreCreative(
  db: Executor,
  storeId: string,
  creativeId?: string,
): Promise<boolean> {
  // Identify S3 locations before removing database rows
  const targetQuery = creativeId
    ? `SELECT s3_bucket, s3_key FROM store_creatives WHERE id = $1 AND store_id = $2`
    : `SELECT s3_bucket, s3_key FROM store_creatives WHERE store_id = $1`;
  const targetParams = creativeId ? [creativeId, storeId] : [storeId];

  try {
    const toDelete = await db.query<{ s3_bucket: string; s3_key: string }>(targetQuery, targetParams);
    if (toDelete.rows.length > 0) {
      const { deleteS3Objects } = await import('@/lib/aws/s3');
      await deleteS3Objects(
        toDelete.rows.map((r) => ({ bucket: r.s3_bucket, key: r.s3_key })),
      );
    }
  } catch (err) {
    console.warn(`[stores] Failed deleting S3 objects for store creative (store: ${storeId}):`, err);
  }

  if (creativeId) {
    await db.query(`DELETE FROM store_creatives WHERE id = $1 AND store_id = $2`, [
      creativeId,
      storeId,
    ]);
  } else {
    await db.query(`DELETE FROM store_creatives WHERE store_id = $1`, [storeId]);
  }

  // If no more creatives remain in store_creatives, reset stores creative fields
  const remaining = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM store_creatives WHERE store_id = $1`,
    [storeId],
  );

  if (parseInt(remaining.rows[0]?.count || '0', 10) === 0) {
    await db.query(
      `UPDATE stores
       SET creative_url = NULL,
           creative_key = NULL,
           creative_bucket = NULL,
           creative_type = NULL,
           video_url = NULL,
           video_key = NULL,
           video_bucket = NULL,
           updated_at = now()
       WHERE id = $1`,
      [storeId],
    );
  }

  return true;
}

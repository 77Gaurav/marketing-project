import type { QueryResultRow } from 'pg';
import type { Executor } from '@/lib/db/pool';
import { uniqueSlug } from '@/lib/db/slug';
import type {
  Brand,
  BrandStatus,
  Campaign,
  CampaignDetail,
  CampaignStatus,
  CampaignVideo,
  VideoStatus,
} from '@/lib/db/types';

/**
 * Reads and writes on `campaigns` and `campaign_videos`.
 *
 * Mappers take a plain record rather than a typed `QueryResultRow` subclass so the same code path
 * serves both a `RETURNING *` row and a `to_jsonb()` payload from a join. That is what keeps the
 * detail query below to a single readable shape instead of a dozen hand-picked column aliases.
 */

const CAMPAIGN_FIELDS = [
  'id',
  'brand_id',
  'slug',
  'name',
  'description',
  'status',
  'starts_on',
  'ends_on',
  'created_by',
  'created_at',
] as const;

const BRAND_FIELDS = [
  'id',
  'name',
  'slug',
  'website',
  'owner_user_id',
  'contact_name',
  'contact_email',
  'contact_phone',
  'status',
  'created_at',
] as const;

const VIDEO_FIELDS = [
  'id',
  'campaign_id',
  'source_filename',
  'source_mime_type',
  'source_bytes',
  'status',
  'original_bucket',
  'original_key',
  'encoded_bucket',
  'encoded_key',
  'width',
  'height',
  'duration_seconds',
  'codec',
  'attempt_count',
  'last_error',
] as const;

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return row[key] as string;
}

function nullableStr(row: Row, key: string): string | null {
  return (row[key] as string | null) ?? null;
}

function nullableNumber(row: Row, key: string): number | null {
  return (row[key] as number | null) ?? null;
}

function toCampaign(row: Row): Campaign {
  return {
    id: str(row, 'id'),
    brandId: str(row, 'brand_id'),
    slug: str(row, 'slug'),
    name: str(row, 'name'),
    description: nullableStr(row, 'description'),
    status: str(row, 'status') as CampaignStatus,
    startsOn: nullableStr(row, 'starts_on'),
    endsOn: nullableStr(row, 'ends_on'),
    createdBy: nullableStr(row, 'created_by'),
    createdAt: new Date(str(row, 'created_at')).toISOString(),
  };
}

function toBrand(row: Row): Brand {
  return {
    id: str(row, 'id'),
    name: str(row, 'name'),
    slug: str(row, 'slug'),
    website: nullableStr(row, 'website'),
    ownerUserId: nullableStr(row, 'owner_user_id'),
    contactName: str(row, 'contact_name'),
    contactEmail: str(row, 'contact_email'),
    contactPhone: str(row, 'contact_phone'),
    status: str(row, 'status') as BrandStatus,
    createdAt: new Date(str(row, 'created_at')).toISOString(),
  };
}

function toVideo(row: Row): CampaignVideo {
  return {
    id: str(row, 'id'),
    campaignId: str(row, 'campaign_id'),
    sourceFilename: str(row, 'source_filename'),
    sourceMimeType: nullableStr(row, 'source_mime_type'),
    sourceBytes: nullableNumber(row, 'source_bytes'),
    status: str(row, 'status') as VideoStatus,
    originalBucket: nullableStr(row, 'original_bucket'),
    originalKey: nullableStr(row, 'original_key'),
    encodedBucket: nullableStr(row, 'encoded_bucket'),
    encodedKey: nullableStr(row, 'encoded_key'),
    width: nullableNumber(row, 'width'),
    height: nullableNumber(row, 'height'),
    durationSeconds: nullableNumber(row, 'duration_seconds'),
    codec: nullableStr(row, 'codec'),
    attemptCount: (row.attempt_count as number) ?? 0,
    lastError: nullableStr(row, 'last_error'),
  };
}

export interface CreateCampaignInput {
  brandId: string;
  name: string;
  description: string | null;
  createdBy: string;
}

export async function createCampaign(db: Executor, input: CreateCampaignInput): Promise<Campaign> {
  // Unique per brand, so the collision check is scoped by brand_id.
  const slug = await uniqueSlug(input.name, async (candidate) => {
    const result = await db.query(`SELECT 1 FROM campaigns WHERE brand_id = $1 AND slug = $2 LIMIT 1`, [
      input.brandId,
      candidate,
    ]);
    return (result.rowCount ?? 0) > 0;
  });

  const result = await db.query(`INSERT INTO campaigns (brand_id, slug, name, description, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${CAMPAIGN_FIELDS.join(', ')}`, [
    input.brandId,
    slug,
    input.name,
    input.description,
    input.createdBy,
  ]);

  return toCampaign(result.rows[0] as Row);
}

export interface PendingVideoInput {
  campaignId: string;
  fileName: string;
  mimeType: string | null;
  bytes: number | null;
}

/**
 * Record the file a browser offered us. Nothing is uploaded, encoded or stored.
 *
 * This is the whole of the current video story: the filename, size and declared MIME type the form
 * reported, written against a row whose status is AWAITING_UPLOAD and whose S3 keys are all NULL.
 * It exists so the pipeline has a row to claim later, and so the campaign detail page can honestly
 * say a file is pending rather than showing an empty slot.
 *
 * Deliberately *not* the future pipeline — there is no presign, no multipart, no completion webhook
 * here. When the real upload lands it updates this same row rather than replacing it.
 */
export async function recordPendingVideo(
  db: Executor,
  input: PendingVideoInput,
): Promise<CampaignVideo> {
  const result = await db.query(`INSERT INTO campaign_videos (campaign_id, source_filename, source_mime_type, source_bytes)
     VALUES ($1, $2, $3, $4)
     RETURNING ${VIDEO_FIELDS.join(', ')}`, [
    input.campaignId,
    input.fileName,
    input.mimeType,
    input.bytes,
  ]);

  return toVideo(result.rows[0] as Row);
}

interface DetailPayloadRow extends QueryResultRow {
  payload: {
    campaign: Row;
    brand: Row;
    video: Row | null;
  } | null;
}

/**
 * Campaign, its brand and its creative in one round trip.
 *
 * `to_jsonb` keeps the nested shape intact; without it every column from both joined tables would
 * need an alias here and a matching pick in the mapper above, and the two would drift.
 */
export async function findCampaignDetail(db: Executor, id: string): Promise<CampaignDetail | null> {
  const result = await db.query<DetailPayloadRow>(
    `SELECT json_build_object(
       'campaign', to_jsonb(c),
       'brand',    to_jsonb(b),
       'video',    to_jsonb(v)
     ) AS payload
     FROM campaigns c
     JOIN brands b ON b.id = c.brand_id
     LEFT JOIN campaign_videos v ON v.campaign_id = c.id
     WHERE c.id = $1`,
    [id],
  );

  const payload = result.rows[0]?.payload;
  if (!payload) return null;

  return {
    campaign: toCampaign(payload.campaign),
    brand: toBrand(payload.brand),
    video: payload.video ? toVideo(payload.video) : null,
  };
}
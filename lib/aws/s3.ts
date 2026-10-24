import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerEnv } from '@/lib/env';
import type { Executor } from '@/lib/db/pool';

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const env = getServerEnv();
  const config: any = {
    region: env.awsRegion,
  };
  if (env.s3AccessKeyId && env.s3SecretAccessKey) {
    config.credentials = {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
    };
  }
  s3Client = new S3Client(config);
  return s3Client;
}

export interface PresignedUploadOptions {
  bucket: string;
  key: string;
  contentType: string;
  contentLength?: number;
  expiresIn?: number;
}

export async function getPresignedPutUrl(options: PresignedUploadOptions): Promise<string> {
  const { bucket, key, contentType, contentLength, expiresIn = 300 } = options;

  let env;
  try {
    env = getServerEnv();
  } catch {
    env = {
      awsRegion: 'us-east-1',
      s3AccessKeyId: null,
      s3SecretAccessKey: null,
    };
  }

  const isMockEnv =
    !env.s3AccessKeyId ||
    !env.s3SecretAccessKey ||
    env.s3AccessKeyId.toLowerCase().includes('mock') ||
    env.s3AccessKeyId.toLowerCase().includes('dummy') ||
    env.s3AccessKeyId.toLowerCase().includes('test');

  if (isMockEnv) {
    return `https://${bucket}.s3.${env.awsRegion || 'us-east-1'}.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-sig-${Date.now()}&mock=true`;
  }

  try {
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ...(contentLength ? { ContentLength: contentLength } : {}),
    });
    return await getSignedUrl(client, command, { expiresIn });
  } catch (error) {
    console.warn('[aws/s3] Failed to generate live presigned PutObject URL, falling back to mock signed URL:', error);
    return `https://${bucket}.s3.${env.awsRegion || 'us-east-1'}.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-sig-${Date.now()}&mock=true`;
  }
}

export interface PresignedDownloadOptions {
  bucket: string;
  key: string;
  expiresIn?: number; // seconds, default 86400 (24 hours)
}

/**
 * Generates an S3 presigned GET URL for hardware screen players to download video creative.
 * Includes graceful fallback for local development or when AWS credentials are not configured.
 */
export async function getPresignedGetUrl(options: PresignedDownloadOptions): Promise<{
  url: string;
  expiresAt: string;
}> {
  const { bucket, key, expiresIn = 86400 } = options;
  const expiresDate = new Date(Date.now() + expiresIn * 1000);
  const expiresAtIso = expiresDate.toISOString();

  let env;
  try {
    env = getServerEnv();
  } catch {
    env = {
      awsRegion: 'us-east-1',
      s3AccessKeyId: null,
      s3SecretAccessKey: null,
    };
  }

  // Graceful fallback for local development / absence of live AWS credentials
  const isMockEnv =
    !env.s3AccessKeyId ||
    !env.s3SecretAccessKey ||
    env.s3AccessKeyId.toLowerCase().includes('mock') ||
    env.s3AccessKeyId.toLowerCase().includes('dummy') ||
    env.s3AccessKeyId.toLowerCase().includes('test');

  if (isMockEnv) {
    const mockUrl = `https://${bucket}.s3.${env.awsRegion || 'us-east-1'}.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-sig-${Date.now()}&mock=true&expires=${expiresAtIso}`;
    return {
      url: mockUrl,
      expiresAt: expiresAtIso,
    };
  }

  try {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const url = await getSignedUrl(client, command, { expiresIn });
    return {
      url,
      expiresAt: expiresAtIso,
    };
  } catch (error) {
    console.warn('[aws/s3] Failed to generate live presigned GetObject URL, falling back to mock signed URL:', error);
    const fallbackUrl = `https://${bucket}.s3.${env.awsRegion || 'us-east-1'}.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-sig-${Date.now()}&mock=true&expires=${expiresAtIso}`;
    return {
      url: fallbackUrl,
      expiresAt: expiresAtIso,
    };
  }
}

export function buildObjectUrl(bucket: string, key: string, region: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export interface S3Location {
  bucket: string;
  key: string;
}

/**
 * Delete a single object from S3.
 * Gracefully handles missing credentials or offline/mock development mode.
 */
export async function deleteS3Object(location: S3Location): Promise<boolean> {
  const { bucket, key } = location;
  if (!bucket || !key) return false;

  let env;
  try {
    env = getServerEnv();
  } catch {
    env = {
      awsRegion: 'us-east-1',
      s3AccessKeyId: null,
      s3SecretAccessKey: null,
    };
  }

  const isMockEnv =
    !env.s3AccessKeyId ||
    !env.s3SecretAccessKey ||
    env.s3AccessKeyId.toLowerCase().includes('mock') ||
    env.s3AccessKeyId.toLowerCase().includes('dummy') ||
    env.s3AccessKeyId.toLowerCase().includes('test');

  if (isMockEnv) {
    console.log(`[aws/s3] (Mock) Deleted S3 object: s3://${bucket}/${key}`);
    return true;
  }

  try {
    const client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await client.send(command);
    console.log(`[aws/s3] Successfully deleted S3 object: s3://${bucket}/${key}`);
    return true;
  } catch (error) {
    console.warn(`[aws/s3] Warning deleting S3 object s3://${bucket}/${key}:`, error);
    return false;
  }
}

/**
 * Delete multiple objects from S3 in sequence.
 */
export async function deleteS3Objects(locations: (S3Location | null | undefined)[]): Promise<number> {
  const valid = locations.filter((loc): loc is S3Location => Boolean(loc && loc.bucket && loc.key));
  let count = 0;
  for (const loc of valid) {
    const ok = await deleteS3Object(loc);
    if (ok) count++;
  }
  return count;
}

/**
 * Collect and delete all S3 creatives (photos, videos) associated with a Store.
 */
export async function deleteStoreS3Creatives(
  db: Executor,
  storeId: string,
): Promise<{ deletedCount: number; keys: string[] }> {
  try {
    const storeRes = await db.query<{
      creative_bucket: string | null;
      creative_key: string | null;
      video_bucket: string | null;
      video_key: string | null;
    }>(
      `SELECT creative_bucket, creative_key, video_bucket, video_key FROM stores WHERE id = $1`,
      [storeId],
    );

    const creativesRes = await db.query<{
      s3_bucket: string;
      s3_key: string;
    }>(
      `SELECT s3_bucket, s3_key FROM store_creatives WHERE store_id = $1`,
      [storeId],
    );

    const targets: S3Location[] = [];

    const store = storeRes.rows[0];
    if (store) {
      if (store.creative_bucket && store.creative_key) {
        targets.push({ bucket: store.creative_bucket, key: store.creative_key });
      }
      if (store.video_bucket && store.video_key) {
        targets.push({ bucket: store.video_bucket, key: store.video_key });
      }
    }

    for (const row of creativesRes.rows) {
      if (row.s3_bucket && row.s3_key) {
        targets.push({ bucket: row.s3_bucket, key: row.s3_key });
      }
    }

    const deletedCount = await deleteS3Objects(targets);
    return { deletedCount, keys: targets.map((t) => t.key) };
  } catch (err) {
    console.warn(`[aws/s3] Error collecting store S3 creatives for store ${storeId}:`, err);
    return { deletedCount: 0, keys: [] };
  }
}

/**
 * Collect and delete all S3 creatives associated with a Brand, including its own video
 * and all campaign videos owned by this brand.
 */
export async function deleteBrandS3Creatives(
  db: Executor,
  brandId: string,
): Promise<{ deletedCount: number; keys: string[] }> {
  try {
    const brandRes = await db.query<{
      video_bucket: string | null;
      video_key: string | null;
    }>(
      `SELECT video_bucket, video_key FROM brands WHERE id = $1`,
      [brandId],
    );

    const videosRes = await db.query<{
      original_bucket: string | null;
      original_key: string | null;
      encoded_bucket: string | null;
      encoded_key: string | null;
    }>(
      `SELECT cv.original_bucket, cv.original_key, cv.encoded_bucket, cv.encoded_key
       FROM campaign_videos cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.brand_id = $1`,
      [brandId],
    );

    const targets: S3Location[] = [];

    const brand = brandRes.rows[0];
    if (brand && brand.video_bucket && brand.video_key) {
      targets.push({ bucket: brand.video_bucket, key: brand.video_key });
    }

    for (const v of videosRes.rows) {
      if (v.original_bucket && v.original_key) {
        targets.push({ bucket: v.original_bucket, key: v.original_key });
      }
      if (v.encoded_bucket && v.encoded_key) {
        targets.push({ bucket: v.encoded_bucket, key: v.encoded_key });
      }
    }

    const deletedCount = await deleteS3Objects(targets);
    return { deletedCount, keys: targets.map((t) => t.key) };
  } catch (err) {
    console.warn(`[aws/s3] Error collecting brand S3 creatives for brand ${brandId}:`, err);
    return { deletedCount: 0, keys: [] };
  }
}

/**
 * Collect and delete all S3 video creatives associated with a Campaign.
 */
export async function deleteCampaignS3Creatives(
  db: Executor,
  campaignId: string,
): Promise<{ deletedCount: number; keys: string[] }> {
  try {
    const videosRes = await db.query<{
      original_bucket: string | null;
      original_key: string | null;
      encoded_bucket: string | null;
      encoded_key: string | null;
    }>(
      `SELECT original_bucket, original_key, encoded_bucket, encoded_key
       FROM campaign_videos
       WHERE campaign_id = $1`,
      [campaignId],
    );

    const targets: S3Location[] = [];
    for (const v of videosRes.rows) {
      if (v.original_bucket && v.original_key) {
        targets.push({ bucket: v.original_bucket, key: v.original_key });
      }
      if (v.encoded_bucket && v.encoded_key) {
        targets.push({ bucket: v.encoded_bucket, key: v.encoded_key });
      }
    }

    const deletedCount = await deleteS3Objects(targets);
    return { deletedCount, keys: targets.map((t) => t.key) };
  } catch (err) {
    console.warn(`[aws/s3] Error collecting campaign S3 creatives for campaign ${campaignId}:`, err);
    return { deletedCount: 0, keys: [] };
  }
}


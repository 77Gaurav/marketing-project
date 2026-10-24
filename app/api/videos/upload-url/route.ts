import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getServerEnv } from '@/lib/env';
import { getPresignedPutUrl, buildObjectUrl } from '@/lib/aws/s3';
import { getPool } from '@/lib/db/pool';
import { findCampaignDetail } from '@/lib/db/repositories/campaigns';
import { findStoreByIdOrSlug } from '@/device_backend';
import {
  isAcceptedStoreCreative,
  resolveCreativeMimeType,
  MAX_STORE_CREATIVE_BYTES,
  getFileExtension,
} from '@/lib/validation/store-creative';
import { randomUUID } from 'crypto';

const ALLOWED_CAMPAIGN_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
]);

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

export const dynamic = 'force-dynamic';

function badRequest(body: { error: string }, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest({ error: 'Request body must be valid JSON.' }, 400);
  }

  const body = payload as any;
  const campaignId = body?.campaignId;
  const storeId = body?.storeId;
  const fileName = body?.fileName;
  const mimeType = body?.mimeType;
  const fileSize = body?.fileSize;

  if (!campaignId && !storeId) {
    return badRequest({ error: 'campaignId or storeId is required.' }, 400);
  }
  if (!fileName || typeof fileName !== 'string') {
    return badRequest({ error: 'fileName is required.' }, 400);
  }
  if (typeof fileSize !== 'number' || fileSize < 1) {
    return badRequest({ error: 'fileSize is required.' }, 400);
  }

  let actor = null;
  try {
    actor = await getSessionUser();
  } catch (error) {
    const env = getServerEnv();
    if (env.devAuthEmail) {
      const { findUserByEmail } = await import('@/lib/db/repositories/users');
      actor = await findUserByEmail(getPool(), env.devAuthEmail).catch(() => null);
    }
    if (!actor && !storeId) {
      console.error('[videos] identity resolution failed', error);
      return badRequest({ error: 'Could not verify your session. Try again shortly.' }, 503);
    }
  }

  const env = getServerEnv();
  if (!env.s3OriginalBucket) {
    return badRequest({ error: 'S3 bucket not configured.' }, 500);
  }

  const db = getPool();

  // Branch 1: Store Custom Creative (supports png, jpeg, jpg, mp4, mkv)
  if (storeId) {
    if (!isAcceptedStoreCreative(fileName, mimeType)) {
      return badRequest(
        { error: 'Unsupported format. Store creative must be PNG, JPEG, JPG, MP4, or MKV.' },
        422,
      );
    }

    if (fileSize > MAX_STORE_CREATIVE_BYTES) {
      return badRequest({ error: 'File size exceeds 500 MB limit.' }, 422);
    }

    const store = await findStoreByIdOrSlug(db, storeId);
    if (!store) {
      return badRequest({ error: 'Store not found.' }, 404);
    }

    if (actor) {
      const isAdmin = can(actor.role, 'user:manage');
      if (!isAdmin && store.ownerUserId && store.ownerUserId !== actor.id) {
        return badRequest({ error: 'You do not have permission to upload to this store.' }, 403);
      }
    }

    const fileExt = getFileExtension(fileName) || 'mp4';
    const resolvedMime = resolveCreativeMimeType(fileName, mimeType);
    const key = `store-creatives/${store.id}/${randomUUID()}.${fileExt}`;

    try {
      const uploadUrl = await getPresignedPutUrl({
        bucket: env.s3OriginalBucket,
        key,
        contentType: resolvedMime,
        contentLength: fileSize,
        expiresIn: 300,
      });

      const objectUrl = buildObjectUrl(env.s3OriginalBucket, key, env.awsRegion);

      return NextResponse.json({
        uploadUrl,
        objectUrl,
        key,
        bucket: env.s3OriginalBucket,
        storeId: store.id,
        mimeType: resolvedMime,
        fileName,
      });
    } catch (error) {
      console.error('[videos] store presigned URL generation failed', error);
      return badRequest({ error: 'Could not generate upload URL. Please try again.' }, 500);
    }
  }

  // Branch 2: Campaign Video
  if (!mimeType || typeof mimeType !== 'string' || !ALLOWED_CAMPAIGN_MIME_TYPES.has(mimeType)) {
    return badRequest({ error: 'Unsupported video format.' }, 422);
  }

  if (fileSize > MAX_VIDEO_BYTES) {
    return badRequest({ error: 'File size exceeds 500 MB limit.' }, 422);
  }

  if (!actor) {
    return badRequest({ error: 'Sign in to upload a video.' }, 401);
  }

  const detail = await findCampaignDetail(db, campaignId);
  if (!detail) {
    return badRequest({ error: 'Campaign not found.' }, 404);
  }

  if (detail.campaign.createdBy !== actor.id && detail.brand.ownerUserId !== actor.id) {
    return badRequest({ error: 'You do not have permission to upload to this campaign.' }, 403);
  }

  const fileExt = fileName.split('.').pop() || 'mp4';
  const key = `originals/${campaignId}/${randomUUID()}.${fileExt}`;

  try {
    const uploadUrl = await getPresignedPutUrl({
      bucket: env.s3OriginalBucket,
      key,
      contentType: mimeType,
      contentLength: fileSize,
      expiresIn: 300,
    });

    const objectUrl = buildObjectUrl(env.s3OriginalBucket, key, env.awsRegion);

    return NextResponse.json({
      uploadUrl,
      objectUrl,
      key,
      bucket: env.s3OriginalBucket,
    });
  } catch (error) {
    console.error('[videos] presigned URL generation failed', error);
    return badRequest({ error: 'Could not generate upload URL. Please try again.' }, 500);
  }
}

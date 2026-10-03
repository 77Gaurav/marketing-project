import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/env';
import { getPresignedPutUrl, buildObjectUrl } from '@/lib/aws/s3';
import { getPool } from '@/lib/db/pool';
import { findCampaignDetail } from '@/lib/db/repositories/campaigns';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = new Set([
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
  const fileName = body?.fileName;
  const mimeType = body?.mimeType;
  const fileSize = body?.fileSize;

  if (!campaignId || typeof campaignId !== 'string') {
    return badRequest({ error: 'campaignId is required.' }, 400);
  }
  if (!fileName || typeof fileName !== 'string') {
    return badRequest({ error: 'fileName is required.' }, 400);
  }
  if (!mimeType || typeof mimeType !== 'string') {
    return badRequest({ error: 'mimeType is required.' }, 400);
  }
  if (typeof fileSize !== 'number' || fileSize < 1) {
    return badRequest({ error: 'fileSize is required.' }, 400);
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return badRequest({ error: 'Unsupported video format.' }, 422);
  }

  if (fileSize > MAX_VIDEO_BYTES) {
    return badRequest({ error: 'File size exceeds 500 MB limit.' }, 422);
  }

  let actor;
  try {
    actor = await getSessionUser();
  } catch (error) {
    console.error('[videos] identity resolution failed', error);
    return badRequest({ error: 'Could not verify your session. Try again shortly.' }, 503);
  }

  if (!actor) {
    return badRequest({ error: 'Sign in to upload a video.' }, 401);
  }

  const db = getPool();
  const detail = await findCampaignDetail(db, campaignId);
  if (!detail) {
    return badRequest({ error: 'Campaign not found.' }, 404);
  }

  if (detail.campaign.createdBy !== actor.id && detail.brand.ownerUserId !== actor.id) {
    return badRequest({ error: 'You do not have permission to upload to this campaign.' }, 403);
  }

  const env = getServerEnv();
  if (!env.s3OriginalBucket) {
    return badRequest({ error: 'S3 bucket not configured.' }, 500);
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

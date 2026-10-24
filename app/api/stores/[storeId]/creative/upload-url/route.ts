import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { getServerEnv } from '@/lib/env';
import { getPresignedPutUrl, buildObjectUrl } from '@/lib/aws/s3';
import { getPool } from '@/lib/db/pool';
import { findStoreByIdOrSlug } from '@/device_backend';
import {
  isAcceptedStoreCreative,
  resolveCreativeMimeType,
  MAX_STORE_CREATIVE_BYTES,
  getFileExtension,
} from '@/lib/validation/store-creative';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

function badRequest(body: { error: string }, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest({ error: 'Request body must be valid JSON.' }, 400);
  }

  const body = payload as any;
  const storeIdentifier = params.storeId || body?.storeId;
  const fileName = body?.fileName;
  const mimeType = body?.mimeType;
  const fileSize = body?.fileSize;

  if (!storeIdentifier || typeof storeIdentifier !== 'string') {
    return badRequest({ error: 'storeId is required.' }, 400);
  }
  if (!fileName || typeof fileName !== 'string') {
    return badRequest({ error: 'fileName is required.' }, 400);
  }
  if (typeof fileSize !== 'number' || fileSize < 1) {
    return badRequest({ error: 'fileSize is required.' }, 400);
  }

  // Validate format (PNG, JPEG, JPG, MP4, MKV)
  if (!isAcceptedStoreCreative(fileName, mimeType)) {
    return badRequest(
      { error: 'Unsupported format. Store creative must be PNG, JPEG, JPG, MP4, or MKV.' },
      422,
    );
  }

  if (fileSize > MAX_STORE_CREATIVE_BYTES) {
    return badRequest({ error: 'File size exceeds 500 MB limit.' }, 422);
  }

  // Verify actor session or admin permission
  let actor = null;
  try {
    actor = await getSessionUser();
  } catch (error) {
    const env = getServerEnv();
    if (env.devAuthEmail) {
      const { findUserByEmail } = await import('@/lib/db/repositories/users');
      actor = await findUserByEmail(getPool(), env.devAuthEmail).catch(() => null);
    }
    if (!actor) {
      console.warn('[stores/creative/upload-url] session resolution note:', error);
    }
  }

  const db = getPool();
  const store = await findStoreByIdOrSlug(db, storeIdentifier);
  if (!store) {
    return badRequest({ error: 'Store not found.' }, 404);
  }

  if (actor) {
    const isAdmin = can(actor.role, 'user:manage');
    if (!isAdmin && store.ownerUserId && store.ownerUserId !== actor.id) {
      return badRequest({ error: 'You do not have permission to manage this store.' }, 403);
    }
  }

  const env = getServerEnv();
  if (!env.s3OriginalBucket) {
    return badRequest({ error: 'S3 bucket not configured.' }, 500);
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
      fileName,
      mimeType: resolvedMime,
    });
  } catch (error) {
    console.error('[stores/creative/upload-url] presigned URL generation failed', error);
    return badRequest({ error: 'Could not generate upload URL. Please try again.' }, 500);
  }
}

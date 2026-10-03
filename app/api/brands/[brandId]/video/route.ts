import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { findBrandById } from '@/lib/db/repositories/brands';
import { getServerEnv } from '@/lib/env';
import { buildObjectUrl } from '@/lib/aws/s3';

export const dynamic = 'force-dynamic';

function badRequest(body: { error: string }, status: number) {
  return NextResponse.json(body, { status });
}

export async function PUT(request: Request, { params }: { params: { brandId: string } }) {
  const brandId = params.brandId;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest({ error: 'Request body must be valid JSON.' }, 400);
  }

  const body = payload as any;
  const videoUrl = body?.videoUrl || body?.objectUrl;
  const videoKey = body?.videoKey || body?.originalKey || body?.key;
  const bucket = body?.bucket;

  if (!videoUrl && !videoKey) {
    return badRequest({ error: 'videoUrl or videoKey is required.' }, 400);
  }

  let actor;
  try {
    actor = await getSessionUser();
  } catch (error) {
    console.error('[brands] identity resolution failed', error);
    return badRequest({ error: 'Could not verify your session. Try again shortly.' }, 503);
  }

  if (!actor) {
    return badRequest({ error: 'Sign in to update brand video.' }, 401);
  }

  const db = getPool();
  const brand = await findBrandById(db, brandId);
  if (!brand) {
    return badRequest({ error: 'Brand not found.' }, 404);
  }

  if (brand.ownerUserId !== actor.id) {
    return badRequest({ error: 'You do not have permission to update this brand.' }, 403);
  }

  const env = getServerEnv();
  const finalUrl = videoUrl || buildObjectUrl(bucket || env.s3OriginalBucket, videoKey, env.awsRegion);

  try {
    const env = getServerEnv();
    await db.query(
      'UPDATE brands SET video_url = $2, video_key = $3, video_bucket = $4, updated_at = now() WHERE id = $1',
      [brandId, finalUrl, videoKey, bucket || env.s3OriginalBucket],
    );
    return NextResponse.json({ success: true, videoUrl: finalUrl, videoKey, videoBucket: bucket || env.s3OriginalBucket });
  } catch (error) {
    console.error('[brands] update failed', error);
    return badRequest({ error: 'Could not update brand.' }, 500);
  }
}

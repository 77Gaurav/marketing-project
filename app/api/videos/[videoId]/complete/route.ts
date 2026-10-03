import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPool } from '@/lib/db/pool';
import { findCampaignDetail, updateVideoUpload } from '@/lib/db/repositories/campaigns';
import { getServerEnv } from '@/lib/env';
import { buildObjectUrl } from '@/lib/aws/s3';

export const dynamic = 'force-dynamic';

function badRequest(body: { error: string }, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request, { params }: { params: { videoId: string } }) {
  const videoId = params.videoId;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest({ error: 'Request body must be valid JSON.' }, 400);
  }

  const body = payload as any;
  const key = body?.key;
  const bucket = body?.bucket;

  if (!key || typeof key !== 'string') {
    return badRequest({ error: 'key is required.' }, 400);
  }

  let actor;
  try {
    actor = await getSessionUser();
  } catch (error) {
    console.error('[videos] identity resolution failed', error);
    return badRequest({ error: 'Could not verify your session. Try again shortly.' }, 503);
  }

  if (!actor) {
    return badRequest({ error: 'Sign in to complete upload.' }, 401);
  }

  const db = getPool();
  const videoResult = await db.query(
    'SELECT v.id, v.campaign_id, v.status FROM campaign_videos v WHERE v.id = $1',
    [videoId],
  );
  if (videoResult.rowCount === 0) {
    return badRequest({ error: 'Video not found.' }, 404);
  }
  const videoRow = videoResult.rows[0];

  const detail2 = await findCampaignDetail(db, videoRow.campaign_id);
  if (!detail2) {
    return badRequest({ error: 'Campaign not found.' }, 404);
  }

  if (detail2.campaign.createdBy !== actor.id && detail2.brand.ownerUserId !== actor.id) {
    return badRequest({ error: 'You do not have permission to complete this upload.' }, 403);
  }

  const env = getServerEnv();
  const targetBucket = bucket || env.s3OriginalBucket;

  try {
    const updated = await updateVideoUpload(db, videoId, {
      originalBucket: targetBucket,
      originalKey: key,
      status: 'UPLOADED',
    });

    const objectUrl = buildObjectUrl(targetBucket, key, env.awsRegion);

    return NextResponse.json({
      video: {
        id: updated.id,
        status: updated.status,
        originalKey: updated.originalKey,
        originalBucket: updated.originalBucket,
        objectUrl,
      },
    });
  } catch (error) {
    console.error('[videos] complete upload failed', error);
    return badRequest({ error: 'Could not complete upload.' }, 500);
  }
}
